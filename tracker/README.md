# MindsetForest Tracker (desktop agent)

> **Szybki start (PL)**
>
> 1. Pobierz **`MindsetForestSetup.exe`**: w dashboardzie Stats → **Komputer i telefon** → **Pobierz instalator (Windows)** (gdy są
>    już dane: **Dodaj komputer lub telefon**) albo bezpośrednio
>    [z GitHub Releases](https://github.com/hmqe333/mindsetforest_dashboard/releases/download/tracker-latest/MindsetForestSetup.exe).
>    To jeden plik, Python nie jest potrzebny.
> 2. Uruchom go. Windows może ostrzec, bo aplikacja nie ma podpisu: **Więcej informacji → Uruchom mimo to**. Instalacja idzie na Twoje
>    konto Windows (`%LOCALAPPDATA%\Programs\MindsetForest`), bez uprawnień administratora.
> 3. W oknie instalatora:
>    - **Konto**: zaloguj się tym samym e-mailem i hasłem co w dashboardzie. Adres bazy instalator pobiera sam z dashboardu. Logujesz się raz;
>      token jest zapisany zaszyfrowany (DPAPI).
>    - **Nagrania (Bandicam)**: folder jest wykrywany z ustawień Bandicam (inaczej `Dokumenty\Bandicam`). Odznacz transkrypcję, jeśli jej nie chcesz.
>    - **Vault Obsidian**: wybierz vault z listy (te, które zna Obsidian) albo zostaw `Dokumenty\MindsetForest Vault`, który zostanie utworzony.
>    - **Skrót** zapisu zaznaczonego tekstu w Archive (domyślnie Alt+Shift+S) i **Uruchamiaj przy starcie Windows**.
>
>    Kliknij **Zainstaluj i uruchom**. Przy zegarze pojawi się zielona ikonka drzewa.
> 4. **Ostatni krok, konieczny: rutyna Claude.** Tracker tylko zamienia nagrania na tekst. Notatki wiedzy robi z nich Claude w zadaniu
>    cyklicznym (rutynie), które ustawiasz raz w Claude Desktop; tego instalator nie zrobi za Ciebie. Ekran "Gotowe" prowadzi przez to krok po kroku:
>    1. Zainstaluj i otwórz [Claude Desktop](https://claude.ai/download).
>    2. Utwórz zadanie cykliczne (scheduled task) uruchamiane co 2-3 godziny.
>    3. Daj mu dostęp do folderu vaulta.
>    4. Jako polecenie wklej tekst z przycisku **Kopiuj polecenie** (jest w nim ścieżka Twojego vaulta), np.:
>
>       ```
>       Open my Obsidian vault at C:\Users\Ja\Documents\MindsetForest Vault. Read _SYSTEM/routine-prompt.md and do exactly what it says.
>       ```
>
>    Instalator od razu zapisuje w vaulcie `_SYSTEM/routine-prompt.md` (cała procedura rutyny) i `_SYSTEM/processing-rules.md`
>    (zasady dobrych notatek), więc rutyna działa jeszcze przed pierwszym nagraniem; zmiany robisz w tych plikach, nie w zadaniu.
>    Bez rutyny nagrania się transkrybują, ale notatki wiedzy nie powstaną: sesje zostają ze `status: new`, a gdy czekają dłużej niż
>    dobę, tracker przypomina powiadomieniem (najwyżej raz na dobę). Kroki z poleceniem pokaże też później
>    **Ustawienia... → Pokaż, jak ustawić rutynę Claude**.
> 5. **Obsidian**: jeśli vault jest już w Obsidianie, przycisk **Otwórz vault w Obsidianie** go otworzy. Nowy folder trzeba raz dodać
>    ręcznie (Obsidian nie pozwala zrobić tego z zewnątrz): w Obsidianie **Open folder as vault** i wskaż folder vaulta; instalator ma
>    przycisk do skopiowania ścieżki.
>
> **Na co dzień**
>
> - Menu ikonki drzewa: **Ustawienia...** (to samo okno co instalator: konto, foldery, skrót, autostart; po **Zapisz** tracker sam się
>   restartuje), **Open dashboard**, **Pause**, **Don't track ...**. Statystyki, klasy i reguły ustawiasz tylko w dashboardzie.
>   Skrót **MindsetForest** w menu Start uruchamia tracker, a gdy już działa, otwiera Ustawienia.
> - **Aktualizacja**: pobierz nowszy instalator i uruchom go. Podmienia program w miejscu (sam zamyka stary tracker i uruchamia nowy);
>   logowanie, ustawienia i dane zostają.
> - **Odinstalowanie**: Ustawienia Windows → Aplikacje → Zainstalowane aplikacje (Apps & features) → **MindsetForest Tracker** →
>   Odinstaluj, albo **Ustawienia... → Odinstaluj...**. Vault i nagrania zostają zawsze; dane lokalne (`%APPDATA%\MindsetForest`)
>   znikają tylko, jeśli to potwierdzisz.
> - **Zapis do Archive**: zaznacz tekst w dowolnym programie (Chrome, PDF, Word) i wciśnij skrót (domyślnie **Alt+Shift+S**). Tekst
>   trafia do Archive jako notatka z tagiem `quick-capture` i tytułem okna jako źródłem. Skrót to modyfikator (Ctrl, Alt, Shift, Win,
>   można je łączyć) plus dokładnie jeden klawisz: litera, cyfra albo F1-F24, np. `alt+shift+s`, `ctrl+shift+f9`. To jedno ustawienie:
>   zmieniasz je w dashboardzie (**Settings → Keybinds**) albo w **Ustawienia...**, a tracker przełącza się w ciągu minuty, bez
>   restartu. Unikaj Ctrl+Alt: na polskiej klawiaturze to AltGr (Ctrl+Alt+S pisze "ś"). Jeśli inny program zajął kombinację, dostaniesz
>   powiadomienie.
> - **Nagrania → Obsidian (Knowledge OS):** każde nowe MP3 w folderze nagrań (także w podfolderach, np. `Audios`) jest transkrybowane
>   (Whisper large-v3-turbo w chmurze, ze znacznikami czasu) i trafia do vaulta jako notatka w `Recordings/` plus sesja w `Sessions/`
>   (`status: new`), którą potem przerabia rutyna Claude. Nagrania zaczęte do 20 min po końcu poprzedniego to ta sama sesja (części
>   jednego wykładu). Oryginalne pliki nie są ruszane. Foldery zmienisz w **Ustawienia...**; `session_gap_minutes` tylko w `config.json`
>   (po zmianie zrestartuj tracker). Notatki z `Knowledge/` i `Sessions/` tracker co minutę kopiuje do dashboardu (Archive → 🧠 Knowledge
>   i 🎙️ Recordings, ze statusem sesji); zmieniona notatka idzie ponownie, usunięta znika. Vault zostaje źródłem: w dashboardzie notatek
>   się nie edytuje.
>
> **Zaawansowane: wersja ze źródeł (Python)** (zip z dashboardu albo ten folder; szczegóły w *Install from source* niżej)
>
> 1. Zainstaluj Python 3.11+ z [python.org](https://www.python.org/downloads/windows/) (zaznacz "Add python.exe to PATH").
> 2. Wrzuć `config.json` z dashboardu (Zaawansowane → **Pobierz config.json**) obok `run-dev.bat` albo skopiuj `config.example.json`
>    do `config.json` i wpisz `supabase_url` oraz `supabase_anon_key` swojego projektu (Supabase → Project Settings → API).
> 3. `run-dev.bat` uruchamia tracker z konsolą (widać log). Ikonka → **Sign in...** i zaloguj się jak w dashboardzie.
> 4. `install-autostart.bat` doinstalowuje zależności, od razu uruchamia tracker (bez konsoli) i dodaje go do autostartu Windows. Folder
>    trzymaj w stałym miejscu (np. `C:\Tools\mindsetforest-tracker`), bo skrót wskazuje właśnie na niego. Aktualizacja: zamknij stary
>    tracker (ikonka → **Quit**), podmień pliki i uruchom skrypt jeszcze raz; logowanie zostaje.
> 5. `build.bat` buduje ten sam `dist\MindsetForestSetup.exe`, który publikuje CI.
>
> Przejście z zipa na instalator: instalator wyłącza autostart starej wersji (usuwa jej skrót z folderu Autostart, sam folder zostaje,
> możesz go potem usunąć) i przejmuje jej `config.json`; logowanie jest wspólne, więc nie trzeba logować się ponownie.
>
> Dane: `%APPDATA%\MindsetForest\` (ustawienia z instalatora `config.json`, baza `tracker.db`, log `tracker.log`, sesja `session.bin`).
> Program: `%LOCALAPPDATA%\Programs\MindsetForest\MindsetForestTracker.exe`.

A headless Windows agent that records which application (and window) is in the
foreground, splits the day into sessions, and uploads them to your own Supabase
project so the MindsetForest web dashboard can show computer time. There is no
window - only a system-tray icon. Classes, rules and statistics live in the web
dashboard.

## What it records

Every second the tracker samples the foreground window and builds **sessions**:
a session is a stretch of time with the same `app_key`, the same window title
and the same idle state. Each row uploaded to `app_usage_sessions` has:

| column | meaning |
| --- | --- |
| `app` | display name, e.g. `Chrome`, `Code`, `Word`, `Slack` (Rambox workspaces get their workspace name) |
| `app_key` | low-cardinality identity the dashboard classifies: `Browser \| YouTube`, `Browser \| github.com`, `Code \| my-project`, `PyCharm \| my-project`, `Word`, ... |
| `window_title` | the full window title at the time (re-read every second, so an editor session follows the file you are in) |
| `started_at` / `ended_at` | UTC timestamps (ISO-8601, `Z`) |
| `seconds` | duration |
| `idle` | `true` for spans with no keyboard/mouse input, a locked screen, or the lock screen itself (`app = Locked`) |
| `local_date` | the day the session belongs to, using a **04:00 local** day boundary (01:30 at night belongs to the previous day) |
| `device_id` | random UUID generated once per installation |

Sessions shorter than `min_session_seconds` (default 2, e.g. an accidental
alt-tab) are merged into the adjacent neighbour: the previous session when it
ends exactly where the short one starts, otherwise the next one. A session
interrupted by sleep, a backwards clock step or *Pause* is closed at the last
good tick, not merged.

### Privacy

* Full window titles are uploaded. Titles can contain document names, chat
  names, email subjects and URLs. Everything is stored under your own user id
  in your own Supabase project, protected by row-level security, and only ever
  sent with your own login token.
* Nothing is captured while tracking is paused or while an app is on the
  don't-track list. Keystrokes and screen content are never read; only the
  "seconds since last input" counter from Windows is used for idle detection.
* The refresh token is stored in `%APPDATA%\MindsetForest\session.bin`
  encrypted with Windows DPAPI (readable only by your Windows account). The
  access token is kept in memory only.

## Installer (MindsetForestSetup.exe)

The normal install is one PyInstaller `--onefile --noconsole` exe built by CI
(`.github/workflows/tracker-windows.yml`, `build-exe.ps1`) and published to the
fixed release tag `tracker-latest`, so the download link never changes. The
setup exe *is* the tracker: it copies itself to
`%LOCALAPPDATA%\Programs\MindsetForest\MindsetForestTracker.exe` (per user, no
admin) and the installed copy runs the tracker. Logic lives in
`mindsetforest_tracker/winsetup.py`, the window in `setup_gui.py`.

* **Supabase URL and key** are fetched from the dashboard site
  (`<site>/downloads/tracker-config.json`, written by the dashboard build from
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`), so nothing is
  committed and nothing is typed. If that fails, the window's *Zaawansowane*
  section asks for them.
* **What install does**: stops a running tracker (it writes `quit.request` in
  the data folder and the tracker quits gracefully), copies the exe, writes
  `%APPDATA%\MindsetForest\config.json` (keeping every setting it does not
  show, e.g. `ignored_apps`), creates the vault and its `_SYSTEM/` notes,
  removes the old zip install's Startup shortcut, sets the `HKCU\...\Run` value
  `MindsetForest Tracker`, adds a Start menu shortcut and an Apps & features
  entry, and starts the tracker.
* **Sign-in in the window** is always a fresh password sign-in. The window
  never refreshes the saved session, because Supabase rotates refresh tokens
  and would revoke the tracker's session if both used it.
* **Upgrade** = run a newer setup exe; the data folder (device id, login,
  transcription state) is untouched. **Uninstall** = Apps & features or
  *Ustawienia... -> Odinstaluj...*; the vault and recordings are never deleted.
* **The Claude routine is the one manual step.** The "Gotowe" page shows the
  steps and a copy button for the scheduled task's prompt
  (`Open my Obsidian vault at <vault>. Read _SYSTEM/routine-prompt.md and do
  exactly what it says.`). Without it transcripts pile up as `status: new`
  sessions; after 24 h the tracker reminds with a notification, at most once a
  day.
* **Command line** (CI and scripted installs): `--install --silent` with
  `--recordings DIR` / `--no-transcribe`, `--vault DIR`, `--hotkey SPEC`,
  `--no-autostart`, `--no-launch`, `--site URL` or `--supabase-url URL
  --anon-key KEY`; `--uninstall [--silent] [--remove-data]`; `--settings`;
  `--self-test OUT.json` (Windows smoke checks). A silent install logs to
  `%APPDATA%\MindsetForest\setup.log`.

## Install from source (advanced)

The zip on the dashboard and this folder run the same tracker from Python.
Use the installer above unless you are changing the code.

1. Install **Python 3.11 or newer** and tick *Add python.exe to PATH*.
2. Download/clone this folder (`tracker/`) somewhere permanent, e.g.
   `C:\Tools\MindsetForestTracker`.
3. Copy `config.example.json` to `config.json` and fill in:

   ```json
   {
     "supabase_url": "https://YOUR-PROJECT.supabase.co",
     "supabase_anon_key": "YOUR-ANON-PUBLIC-KEY",
     "dashboard_url": "https://mindsetforest.app",
     "idle_minutes": 3,
     "tick_seconds": 1,
     "sync_seconds": 60,
     "device_name": "",
     "min_session_seconds": 2,
     "ignored_apps": [],
     "private_keywords": []
   }
   ```

   `config.json` is looked for next to the exe/script first, then in
   `%APPDATA%\MindsetForest\config.json` (a UTF-8 BOM, as written by
   PowerShell, is fine). `device_name` defaults to the computer name.
   `min_session_seconds` is the merge threshold described above. The anon
   key is the public one from Supabase -> Project Settings -> API; it is not
   a secret, your login is what grants access. Set the environment variable
   `MINDSETFOREST_HOME` to move the data folder somewhere other than
   `%APPDATA%\MindsetForest`.
4. Run `run-dev.bat` (installs `requirements.txt` and starts the tracker with a
   console so you can watch the log). A green tree icon appears in the tray.
5. **First sign-in**: tray icon -> *Sign in...* -> your MindsetForest email and
   password. The item only shows when no session is saved. From then on the
   tracker refreshes its token by itself.
6. **Autostart**: run `install-autostart.bat`. It creates *MindsetForest
   Tracker.lnk* in your Startup folder pointing at the built exe if it exists,
   otherwise at `pythonw run_tracker.py` (installing `requirements.txt` into
   that Python first), and starts the tracker right away. A tracker that is
   already running keeps going (the new one exits), so to update, quit the old
   one from the tray first. `uninstall-autostart.bat` removes the shortcut.
7. **Build the installer exe** (optional): `build.bat` runs `build-exe.ps1`,
   which installs PyInstaller and produces `dist\MindsetForestSetup.exe`, the
   same one-file exe CI publishes. Run it to install as described above.

## How idle, lock, sleep and "don't track" work

* **Idle** - no keyboard/mouse input for `idle_minutes` (default 3). The
  active session is closed retroactively at the moment of the last input, and
  an `idle=true` session for the same app/window starts there. Idle spans are
  kept (not dropped) so the dashboard can count them for classes where idle
  time is legitimate, e.g. watching video.
* **Lock screen** - when Windows has no foreground window or the foreground
  process is `LockApp.exe`/`LogonUI.exe`, an `idle=true` session with
  `app = Locked` is recorded.
* **Sleep / hibernate** - if the clock jumps more than 10 seconds between two
  samples, the open session is closed at the last good sample; the gap itself
  is not recorded.
* **Pause tracking** - closes the current session; nothing is recorded until
  *Resume*. The icon turns grey.
* **Don't track \<app\>** - adds the app's display name to `ignored_apps` in
  `config.json`, closes the current session without uploading it (a partial
  upload already made for that session is deleted), and skips that app at
  capture time from then on. Edit `config.json` to un-ignore an app.

## Private windows

Adult sites and words (`mindsetforest_tracker/privacy.py`) are never recorded,
not even locally: the open session closes and nothing is written while such a
window is in front, exactly like an ignored app. Your own keywords come from
the dashboard (Stats -> Computer -> Apps -> *Private: never tracked*) at every
sync, plus any in `private_keywords` in `config.json`. The database refuses the
same windows too (`20260930120000_app_usage_privacy.sql`), so an older copy of
this agent cannot store them either.

## Save selection to Archive

Select text in any app and press **Alt+Shift+S** (`capture_hotkey`). The
tracker copies the selection the way Ctrl+C does and saves it as an Archive
note (`archive_blocks`) under your account: the first 60 characters become
the title, the window title (without the browser's name) is added as
`Source:`, and the note is tagged `quick-capture` so it is easy to review.
A balloon confirms it, and the note is indexed for semantic search.

* The copied text stays on the clipboard. If the save fails (offline), paste
  it into the Archive inbox later; nothing is lost.
* A window the tracker treats as private gets no `Source:` line.
* Set the hotkey in the dashboard (**Settings -> Keybinds -> On your PC**).
  The tracker reads it at every sync (once a minute) and switches without a
  restart; `""` there turns it off. Until it is set in the dashboard,
  `capture_hotkey` in `config.json` applies.
* Ctrl+Alt combinations are avoided: on Polish (AltGr) keyboards Ctrl+Alt+S
  types "s with an accent" and a global hotkey would swallow it. Any
  `modifier+key` works (`ctrl+shift+f9`, `win+shift+s`, ...).
  If another app already owns the combination, a balloon says so.
* The setup window's choice is pushed to the dashboard once (RPC
  `set_tracker_capture_hotkey`), so the window and the dashboard never
  disagree; after that the dashboard's value wins as above.

## Where data lands

| what | where |
| --- | --- |
| local queue of sessions (SQLite) | `%APPDATA%\MindsetForest\tracker.db` |
| log (1 MB x 3, rotating) | `%APPDATA%\MindsetForest\tracker.log` |
| encrypted refresh token | `%APPDATA%\MindsetForest\session.bin` |
| single-instance lock | `%APPDATA%\MindsetForest\tracker.lock` |
| settings written by the installer | `%APPDATA%\MindsetForest\config.json` |
| installed program | `%LOCALAPPDATA%\Programs\MindsetForest\MindsetForestTracker.exe` |
| cloud | table `app_usage_sessions` in your Supabase project |

Rows are written locally as soon as a session closes, and the *open* session
is written every `sync_seconds` (60 by default) so a long session shows up in
the dashboard while it is still running. On the same interval the sync thread
upserts unsynced rows in batches of 200
(`on_conflict=user_id,device_id,started_at`). When offline, rows wait locally
and the tracker retries with back-off (1, 2, 4, 8, 10 minutes). If the server
rejects a batch (HTTP 4xx other than 401/429) it is retried row by row and the
rows that still fail are quarantined locally (`synced = -1` in `tracker.db`)
and logged, so one bad row never blocks the rest. Synced rows older than 90
days are purged from the local database. `MINDSETFOREST_HOME` overrides the
data folder.

## Troubleshooting

* **No tray icon** - check `tracker.log`. "Another tracker instance is already
  running" means a second copy was started; `tracker.lock` holds the other
  process id. A lock left behind by a crash is taken over automatically
  (the pid must belong to a running tracker to count).
* **"Saved session unreadable ... moved to session.bin.bad"** - the token
  file could not be decrypted (copied from another PC/user, or corrupt). Sign
  in again from the tray.
* **"Not signed in" / balloon asking to sign in** - the saved token was
  rejected (password changed, session revoked). Use *Sign in...* again.
* **"Sync error: ..."** in the menu - the last upload failed; the message is
  the HTTP status or network error. Rows are kept locally and retried. A 401
  after a successful sign-in usually means the `supabase_url`/anon key in
  `config.json` belong to a different project; a 404 means the
  `app_usage_sessions` table/migration is missing.
* **Nothing is recorded** - tracking is paused (grey icon), or the app is in
  `ignored_apps`.
* **Wrong app names / keys** - the rules are in `mindsetforest_tracker/normalize.py`
  (browsers -> `Browser | site`, editors -> `App | project`, everything else ->
  display name). Anything more specific belongs in the dashboard's rules.
* **Dev run on Linux/macOS** - the code imports without pywin32/pystray and uses
  a fake sampler; only the test-suite is meaningful there:
  `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt psutil requests pillow && python -m pytest -q`.

## Layout

```
tracker/
  mindsetforest_tracker/
    config.py     config.json loading/saving, data folder
    capture.py    win32 foreground/idle/lock sampling (FakeSampler elsewhere)
    normalize.py  app display name + app_key rules
    sessions.py   session state machine (idle, sleep gap, merging, 04:00 rule)
    store.py      SQLite queue (sessions + kv)
    auth.py       Supabase password/refresh auth, DPAPI-encrypted session file
    sync.py       background upload thread with back-off
    archive_capture.py  hotkey that saves the selected text to the Archive
    recordings.py Bandicam MP3 -> transcript -> vault, vault mirror, routine reminder
    tray.py       pystray icon, menu, sign-in dialog
    winsetup.py   install / upgrade / uninstall, folder and vault detection
    setup_gui.py  the setup and "Ustawienia..." window (tkinter)
    main.py       wiring, single-instance guard, logging, setup dispatch
  tests/          pytest suite (runs on Linux)
  run_tracker.py  entry point for run-dev.bat and PyInstaller
  build-exe.ps1   builds dist\MindsetForestSetup.exe (build.bat runs it)
```
