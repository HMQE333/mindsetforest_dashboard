<#
.SYNOPSIS
    Builds dist\MindsetForestSetup.exe: the one file that installs, configures and runs the tracker.

.DESCRIPTION
    PyInstaller --onefile --noconsole. The same exe is the setup window, the
    settings window and the tracker itself (main.decide_action picks the mode),
    so everything the setup needs is bundled too: tkinter, pywin32 (shortcuts,
    DPAPI), pystray and Pillow. build.bat runs this for a local build and CI
    (.github/workflows/tracker-windows.yml) runs it before the exe's
    --self-test, so a missing hidden import fails there and not on a user's PC.
    Works in Windows PowerShell 5.1 (build.bat) and PowerShell 7 (CI).

.PARAMETER Python
    The interpreter to build with. Its installed packages are what ends up in the exe.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File build-exe.ps1
.EXAMPLE
    .\build-exe.ps1 -Python C:\Python312\python.exe
#>
[CmdletBinding()]
param(
    [string]$Python = 'python'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Name = 'MindsetForestSetup'
# The flags below are PyInstaller 6.x flags. "~=" rather than "<7": a "<" would be a
# redirection if "python" turns out to be a .bat shim (pyenv-win).
$PyInstallerSpec = 'pyinstaller~=6.11'

# Imports PyInstaller cannot see by reading the code.
$HiddenImports = @(
    'pystray._win32'       # pystray chooses its backend at run time
    'PIL._tkinter_finder'  # loaded from C by Pillow's Tk glue
    'PIL.ImageTk'          # the setup window's icon
    'win32crypt'           # DPAPI for session.bin (auth.protect / unprotect)
    'win32com'             # WScript.Shell: Start menu shortcut, old Startup shortcut
    'win32com.client'
    'pythoncom'
    'pywintypes'
    'win32timezone'        # pywin32 needs it to turn COM dates into datetime
    'psutil'               # stopping the running tracker before an upgrade
    'requests'
)

function Invoke-Native {
    <# Runs one native command and throws on a non-zero exit code. #>
    param([string]$What, [scriptblock]$Command)
    Write-Host ''
    Write-Host "== $What"
    $global:LASTEXITCODE = 0
    # pip and PyInstaller log to stderr; only the exit code says whether they failed.
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Command } finally { $ErrorActionPreference = $saved }
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)." }
}

Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Get-Command $Python -ErrorAction SilentlyContinue)) {
        throw "Python was not found ('$Python'). Install Python 3.11+ from python.org (tick 'Add python.exe to PATH') or pass -Python C:\path\to\python.exe."
    }
    $exe = Join-Path $PSScriptRoot "dist\$Name.exe"
    if (Test-Path -LiteralPath $exe) {
        try { Remove-Item -LiteralPath $exe -Force }
        catch { throw "Cannot replace $exe ($($_.Exception.Message)). Close it if it is running and build again." }
    }

    Invoke-Native 'Installing dependencies and PyInstaller' {
        & $Python -m pip install --disable-pip-version-check -r requirements.txt $PyInstallerSpec
    }

    New-Item -ItemType Directory -Force -Path assets | Out-Null
    Invoke-Native 'Writing the tray icon to assets\icon.ico' {
        & $Python -c "from mindsetforest_tracker.tray import save_ico; save_ico(r'assets\icon.ico')"
    }

    $global:LASTEXITCODE = 0
    $version = (& $Python -c "from mindsetforest_tracker import __version__; print(__version__)" | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $version) { throw 'Could not read the tracker version (mindsetforest_tracker.__version__).' }
    Write-Host "Tracker version $version"

    $pyiArgs = @(
        '-m', 'PyInstaller'
        '--onefile', '--noconsole', '--noconfirm', '--clean'
        '--name', $Name
        '--icon', 'assets\icon.ico'
        '--add-data', 'assets\icon.ico;assets'
        # setup_gui and winsetup are imported lazily; take every module of the package.
        '--collect-submodules', 'mindsetforest_tracker'
    )
    foreach ($module in $HiddenImports) { $pyiArgs += @('--hidden-import', $module) }
    $pyiArgs += 'run_tracker.py'
    Invoke-Native 'Running PyInstaller (one file, no console)' { & $Python @pyiArgs }

    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "PyInstaller finished but $exe is missing." }
    $size = [math]::Round((Get-Item -LiteralPath $exe).Length / 1MB, 1)
    $hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
    Write-Host ''
    Write-Host "Built $exe ($size MB), tracker $version"
    Write-Host "SHA256 $hash"
}
finally {
    Pop-Location
}
