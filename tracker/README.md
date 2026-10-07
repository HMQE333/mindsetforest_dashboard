# MindsetForest Tracker (desktop agent)

> **Szybki start (PL)**
>
> 1. Zainstaluj Python 3.11+ z [python.org](https://www.python.org/downloads/windows/) (zaznacz "Add python.exe to PATH").
> 2. Skopiuj `config.example.json` do `config.json` i wpisz `supabase_url` oraz `supabase_anon_key` swojego projektu (Supabase -> Project Settings -> API).
> 3. Uruchom `run-dev.bat` - w zasobniku systemowym (przy zegarze) pojawi sie zielona ikonka drzewa.
> 4. Kliknij ikonke -> **Sign in...** i zaloguj sie tym samym e-mailem i haslem co w MindsetForest. Logujesz sie raz; token jest zapisany zaszyfrowany (DPAPI).
> 5. `install-autostart.bat` - doinstalowuje zaleznosci, od razu uruchamia tracker (bez konsoli) i dodaje go do autostartu Windows. Folder trzymaj w stalym miejscu (np. `C:\Tools\mindsetforest-tracker`), bo skrot wskazuje wlasnie na niego; po przeniesieniu uruchom skrypt jeszcze raz. Aktualizacja: zamknij stary tracker (ikonka -> **Quit**), podmien pliki i uruchom `install-autostart.bat`; logowanie zostaje. `build.bat` buduje `dist\MindsetForestTracker\MindsetForestTracker.exe`, ktory nie wymaga Pythona.
> 6. Statystyki, klasy i reguly ustawiasz tylko w panelu www (**Open dashboard** w menu ikonki). Z menu mozesz tez wstrzymac sledzenie (**Pause**) i wykluczyc aktualna aplikacje (**Don't track ...**).
>
> 7. **Zapis do Archive:** zaznacz tekst w dowolnym programie (Chrome, PDF, Word) i wcisnij **Alt+Shift+S**. Tekst trafia do Archive jako notatka z tagiem `quick-capture` i tytulem okna jako zrodlem. Skrot zmienisz w panelu www (**Settings -> Keybinds**, tracker pobiera go w ciagu minuty) albo w `config.json` (`capture_hotkey`, pusty = wylaczony).
>
> 8. **Nagrania → Obsidian (Knowledge OS):** każde nowe MP3 w `Documents\Bandicam` jest transkrybowane (Whisper large-v3-turbo w chmurze, ze znacznikami czasu) i trafia do vaulta `Documents\MindsetForest Vault` jako notatka w `Recordings/` plus sesja w `Sessions/` (`status: new`). Nagrania zaczęte do 20 min po końcu poprzedniego to ta sama sesja (części jednego wykładu). Oryginalne pliki nie są ruszane. Ścieżki zmienisz w `config.json`: `recordings_dir`, `vault_dir`, `session_gap_minutes` (po zmianie zrestartuj tracker). W vaulcie `_SYSTEM/processing-rules.md` to zasady dla Claude, a `_SYSTEM/routine-prompt.md` to treść do wklejenia jako rutyna w Claude Desktop. Notatki z `Knowledge/` i `Sessions/` tracker co minutę kopiuje do dashboardu (Archive → 🧠 Knowledge i 🎙️ Recordings, ze statusem sesji); zmieniona notatka idzie ponownie, usunięta znika. Vault zostaje źródłem: w dashboardzie notatek się nie edytuje.
>
> Dane: `%APPDATA%\MindsetForest\` (baza `tracker.db`, log `tracker.log`, sesja `session.bin`).

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

## Install on Windows

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
7. **Build a standalone exe** (optional): `build.bat` installs PyInstaller and
   produces `dist\MindsetForestTracker\MindsetForestTracker.exe` (`--noconsole
   --onedir`). Copy your `config.json` next to the exe (the script does that
   automatically if it finds one) and re-run `install-autostart.bat`.

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

## Where data lands

| what | where |
| --- | --- |
| local queue of sessions (SQLite) | `%APPDATA%\MindsetForest\tracker.db` |
| log (1 MB x 3, rotating) | `%APPDATA%\MindsetForest\tracker.log` |
| encrypted refresh token | `%APPDATA%\MindsetForest\session.bin` |
| single-instance lock | `%APPDATA%\MindsetForest\tracker.lock` |
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
    tray.py       pystray icon, menu, sign-in dialog
    main.py       wiring, single-instance guard, logging
  tests/          pytest suite (runs on Linux)
  run_tracker.py  entry point for run-dev.bat and PyInstaller
```
