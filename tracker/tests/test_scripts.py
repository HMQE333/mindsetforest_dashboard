"""The .bat scripts can't run on Linux, so check what once broke them: lost quotes and line breaks."""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = sorted(ROOT.glob("*.bat"))
SHORTCUT = "'MindsetForest Tracker.lnk'"


def powershell_lines(text: str) -> list[str]:
    """The quoted lines continuing a ``powershell ... -Command ^`` call."""
    out, inside = [], False
    for line in text.split("\r\n"):
        if line.startswith("powershell ") and line.endswith("^"):
            inside = True
            continue
        if inside:
            out.append(line.strip())
            inside = line.endswith("^")
    return out


@pytest.mark.parametrize("path", SCRIPTS, ids=lambda p: p.name)
def test_scripts_use_crlf(path):
    data = path.read_bytes()
    assert data.count(b"\n") == data.count(b"\r\n")


@pytest.mark.parametrize("name", ["install-autostart.bat", "uninstall-autostart.bat"])
def test_autostart_powershell_is_intact(name):
    text = (ROOT / name).read_bytes().decode("ascii")  # read_text would turn CRLF into LF
    lines = powershell_lines(text)
    assert lines and SHORTCUT in lines[0]
    for line in lines:
        assert line.startswith('"') and line.rstrip(" ^").endswith('"'), line
        assert line.count('"') == 2 and line.count("'") % 2 == 0, line
