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
>    - **Konto**: zaloguj się tym samym e-mailem i hasłem co w dashboardzie. Adres bazy instalator pobiera sam z dashboardu
>      (`https://hmqe333.github.io/mindsetforest_dashboard/`), a pod polami pokazuje serwer logowania. Logujesz się raz; token jest
>      zapisany zaszyfrowany (DPAPI).
>    - **Nagrania (Bandicam)**: folder jest wykrywany z ustawień Bandicam (inaczej `Dokumenty\Bandicam`); podaj pełną ścieżkę z literą
>      dysku albo kliknij **Wybierz...**. Tracker patrzy w ten folder i podfoldery do 3 poziomów w dół. Jeśli są w nim już MP3, okno pyta
>      **Przetwórz też nagrania, które już są w folderze (N)**: bez tego transkrybowane są tylko nowe nagrania (dla folderu Bandicam pole
>      jest domyślnie zaznaczone, dla innych nie, żeby nie wysłać przypadkiem np. muzyki). Odznacz transkrypcję, jeśli jej nie chcesz.
>    - **Vault Obsidian**: wybierz vault z listy (te, które zna Obsidian) albo zostaw `Dokumenty\MindsetForest Vault`, który zostanie utworzony.
>    - **Skrót** zapisu zaznaczonego tekstu w Archive (domyślnie Alt+Shift+S; jeśli ustawiłeś inny w dashboardzie, okno pokazuje ten) i
>      **Uruchamiaj przy starcie Windows**.
>    - **Rozpoznawaj stronę po domenie aktywnej karty (bez pełnego adresu)**: w Chrome, Edge i Brave tracker czyta z paska adresu
>      tylko domenę (np. `chatgpt.com`), nigdy ścieżki, wyszukiwania ani tego, co wpisujesz; plik z dysku to `Local file`. Dzięki temu
>      karta bez nazwy strony w tytule (np. rozmowa w ChatGPT) nie ląduje w `Browser | other`. Odznacz, a karty będą rozpoznawane
>      tylko po tytule.
>
>    Kliknij **Zainstaluj i uruchom** (przyciski są zawsze na dole okna). Przy zegarze pojawi się zielona ikonka drzewa; Windows 11
>    chowa nowe ikonki pod strzałką **^** obok zegara.
> 4. **Ostatni krok, konieczny: rutyna Claude.** Tracker tylko zamienia nagrania na tekst. Notatki wiedzy robi z nich Claude w zadaniu
>    cyklicznym (rutynie), które ustawiasz raz w Claude Desktop; tego instalator nie zrobi za Ciebie. Ekran "Gotowe" prowadzi przez to krok po kroku:
>    1. Zainstaluj i otwórz [Claude Desktop](https://claude.ai/download).
>    2. W lewym pasku kliknij **Scheduled**, potem **New task** (prawy górny róg) i **Set up manually**. Częstotliwość: **Hourly**.
>    3. Jako folder zadania wskaż folder vaulta. Zadanie musi działać lokalnie, na tym komputerze (nie w chmurze), inaczej nie dostanie
>       się do vaulta.
>    4. Jako polecenie (prompt) wklej tekst z przycisku **Kopiuj polecenie** (jest w nim ścieżka Twojego vaulta), np.:
>
>       ```
>       Open my Obsidian vault at C:\Users\Ja\Documents\MindsetForest Vault. Read _SYSTEM/routine-prompt.md and do exactly what it says.
>       ```
>
>    Zadanie uruchamia się tylko, gdy Claude Desktop jest włączony, a komputer nie śpi; pominięte uruchomienie nadrobi, gdy wrócisz.
>    Instalator od razu zapisuje w vaulcie `_SYSTEM/routine-prompt.md` (cała procedura rutyny) i `_SYSTEM/processing-rules.md`
>    (zasady dobrych notatek), więc rutyna działa jeszcze przed pierwszym nagraniem; zmiany robisz w tych plikach, nie w zadaniu.
>    Rutyna pisze dla każdego wykładu podsumowanie w `Lectures/<przedmiot>/` (w języku wykładu: najpierw mapa wykładu, potem
>    tematy, to, na co prowadzący kładł nacisk, „Do zapamiętania” i słowniczek; wyjaśnienia AI są w zwijanych blokach „Dla
>    zrozumienia (AI)”) oraz kilka notatek w `Knowledge/`. Gdy przedmiot ma co najmniej dwa podsumowania, pisze też jego
>    podręcznik (niżej: **Podręcznik przedmiotu**).
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
>   Skrót **MindsetForest** w menu Start uruchamia tracker, a gdy już działa, otwiera Ustawienia (gdy ikonki nie widać przy zegarze,
>   jest pod strzałką **^**).
> - **Logowanie wygasło**: gdy serwer odrzuci zapisane logowanie (np. po wylogowaniu w dashboardzie), Ustawienia pokazują
>   **Logowanie wygasło (e-mail): zaloguj się ponownie** z polami logowania; po **Zapisz** tracker używa nowego logowania.
> - **Aktualizacja**: pobierz nowszy instalator i uruchom go. Podmienia program w miejscu (sam zamyka stary tracker i uruchamia nowy);
>   logowanie, ustawienia (także wyłączony autostart) i dane zostają. Wersja 1.3.0 wprowadza nowy format rutyny (podsumowania
>   wykładów) i podmienia `_SYSTEM/routine-prompt.md` oraz `_SYSTEM/processing-rules.md`. Jeśli je zmieniałeś, Twoja wersja
>   zostaje obok jako `... (moja wersja <data>).md`, a wpis w `_SYSTEM/routine-log.md` o tym przypomina. Potem możesz je
>   zmieniać dowolnie: zmienionego pliku tracker już nie nadpisze, a niezmieniony podmienia na nowszą wersję z aktualizacji
>   (też z wpisem w `routine-log.md`).
> - **Odinstalowanie**: Ustawienia Windows → Aplikacje → Zainstalowane aplikacje (Apps & features) → **MindsetForest Tracker** →
>   Odinstaluj, albo **Ustawienia... → Odinstaluj...**. Vault i nagrania zostają zawsze; dane lokalne (`%APPDATA%\MindsetForest`)
>   znikają tylko, jeśli to potwierdzisz.
> - **Zapis do Archive**: zaznacz tekst w dowolnym programie (Chrome, PDF, Word) i wciśnij skrót (domyślnie **Alt+Shift+S**). Tekst
>   trafia do Archive jako notatka z tagiem `quick-capture` i tytułem okna jako źródłem. Skrót to modyfikator (Ctrl, Alt, Shift, Win,
>   można je łączyć) plus dokładnie jeden klawisz: litera, cyfra albo F1-F24, np. `alt+shift+s`, `ctrl+shift+f9`. To jedno ustawienie:
>   zmieniasz je w dashboardzie (**Settings → Keybinds**) albo w **Ustawienia...**, a tracker przełącza się w ciągu minuty, bez
>   restartu. Unikaj Ctrl+Alt: na polskiej klawiaturze to AltGr (Ctrl+Alt+S pisze "ś"). Jeśli inny program zajął kombinację, dostaniesz
>   powiadomienie.
> - **Nagrania → Obsidian (Knowledge OS):** każde nowe MP3 w folderze nagrań (także w podfolderach do 3 poziomów, np. `Audios`) jest
>   transkrybowane
>   (Whisper large-v3-turbo w chmurze, ze znacznikami czasu) i trafia do vaulta jako notatka w `Recordings/` plus sesja w `Sessions/`
>   (`status: new`), którą potem przerabia rutyna Claude. Nagrania zaczęte do 20 min po końcu poprzedniego to ta sama sesja (części
>   jednego wykładu). Oryginalne pliki nie są ruszane. Foldery zmienisz w **Ustawienia...**; `session_gap_minutes` tylko w `config.json`
>   (po zmianie zrestartuj tracker). Podsumowania z `Lectures/`, notatki z `Knowledge/`, sesje z `Sessions/` i dziennik rutyny
>   (`_SYSTEM/routine-log.md`) tracker co minutę kopiuje do dashboardu (Archive → Wykłady i 🎙️ Recordings, ze statusem sesji);
>   zmieniona notatka idzie ponownie, usunięta znika. Vault zostaje źródłem: w dashboardzie notatek się nie edytuje.
> - **Import (transkrypcje z platformy uczelni, kursy, YouTube):** pobrane pliki wrzucaj do folderu `Import` w vaulcie: .txt, .md,
>   .vtt, .srt, .docx, .pdf. Jeden plik albo jeden podfolder to jeden wykład. W podfolderze plik z „podsumowanie” lub „summary”
>   w nazwie to podsumowanie z platformy (rutyna tylko sprawdza nim, czy nic nie umknęło; źródłem jest transkrypcja), a inne .pdf
>   i .docx to materiały (slajdy). Data w nazwie (`2026-10-11` albo `11.10.2026`, opcjonalnie z godziną, np. `13-30`) to data
>   wykładu; bez niej liczy się data pliku. Minutę po ostatniej zmianie tracker robi z tego sesję, tak jak z nagrania (napisy
>   .vtt/.srt zachowują czas, inny tekst dostaje numerowane akapity), i przenosi pliki do `Import/_done`. Niczego nie usuwa,
>   a tego samego pliku drugi raz nie zaimportuje. Plik, którego nie da się odczytać (np. skan PDF bez tekstu), zostaje na
>   miejscu, a tracker mówi o tym powiadomieniem.
> - **Podręcznik przedmiotu:** gdy przedmiot ma co najmniej dwa podsumowania, rutyna pisze `Lectures/<przedmiot>/_Podręcznik.md`
>   (kurs po angielsku: `_Textbook.md`): cały przedmiot jako jeden zwarty model. Najpierw mapa, potem mechanizmy, ograniczenia,
>   co zapamiętać, a co wyprowadzić, cały przedmiot na jednej stronie i 8-12 pytań sprawdzających na końcu. Pisze go według
>   Twojego promptu Primer (`_SYSTEM/primer-prompt.md`, bez niego według krótszej wersji wbudowanej), tylko z podsumowań
>   i notatek tego przedmiotu, w jego języku. Odświeża go po każdym nowym wykładzie, najwyżej jeden podręcznik na uruchomienie.
>   Plik jest za każdym razem pisany od nowa, więc własne notatki trzymaj obok. W dashboardzie to pierwsza karta przedmiotu
>   w Archive → Wykłady.
> - **Nauka z ChatGPT i Claude:** swój tryb nauki i prompt podręcznika (Primer) wpisujesz w dashboardzie: **Settings → AI
>   Context → Nauka** (**Wczytaj z Archiwum** wstawia je z Twoich notatek). Tam też możesz podać link do projektu w ChatGPT.
>   Tracker po zalogowaniu i potem co 10 minut kopiuje oba teksty do vaulta jako `_SYSTEM/learning-mode.md` (czyta go Claude
>   Desktop, gdy przegadujesz wykład) i `_SYSTEM/primer-prompt.md` (według niego rutyna pisze podręcznik). Zmieniaj je
>   w dashboardzie, nie w vaulcie: kopię w vaulcie tracker nadpisuje, a puste pole niczego nie kasuje. Przyciski przy wykładzie
>   i podręczniku kopiują materiał do schowka: **Ucz się w ChatGPT** i **Test w ChatGPT** otwierają ChatGPT (albo Twój
>   projekt), **Przegadaj w Claude** daje krótkie polecenie do wklejenia w Claude Desktop. Długa nauka idzie więc na Twoich
>   subskrypcjach, nie przez asystenta w dashboardzie.
> - **Starsze wykłady od nowa**: żeby rutyna zrobiła podsumowanie sesji przerobionej w starym formacie, ustaw w jej notatce
>   w `Sessions/` z powrotem `status: new`.
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
| `app_key` | low-cardinality identity the dashboard classifies: `Browser \| YouTube`, `Browser \| github.com`, `Browser \| New Tab`, `Code \| my-project`, `PyCharm \| my-project`, `Word`, ... For Chrome, Edge, Brave and other Chromium browsers the site comes from the active tab's domain when it can be read (see Privacy), otherwise from the window title |
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
* For Chrome, Edge, Brave and other Chromium browsers the tracker reads the
  **domain of the active tab, never the address**: the address bar's text is
  read through UI Automation when the window title changes, reduced to its
  host (`chatgpt.com`) and only that is kept, inside `app_key` (`Browser |
  ChatGPT`, `Browser | rybiapaka.pl`). Paths, queries, search words and what
  you type are never stored or logged; a local file is `Browser | Local
  file`, an internal page (`brave://settings`) `Browser | Browser page`. No
  extension is installed and web pages are never inspected. The private-window
  rules also check the domain. The read runs on a thread of its own and a
  tick waits for it at most 0.3 s, so a busy browser never stalls tracking:
  its tab is named from the title until the answer comes. CI reads
  example.com from Chrome's and Edge's address bars (about 1.4 s for the
  first read, which includes finding the bar); Edge's first-run pages on a
  fresh profile can delay it. Turn it off with the setup window's
  *Rozpoznawaj stronę po domenie aktywnej karty* checkbox or
  `"browser_domains": false` in `config.json`; then no UI Automation runs at
  all and tabs are named from their titles. Firefox is always named by title.
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
  show, e.g. `ignored_apps`), creates the vault with its `_SYSTEM/` notes
  and `Import/` folder (upgrading an older tracker's notes, see below),
  removes the old zip install's Startup shortcut, sets the `HKCU\...\Run` value
  `MindsetForest Tracker` to `"<exe>" --autostart`, adds a Start menu shortcut
  and an Apps & features entry, and starts the tracker. The vault folder is
  checked (created and written to) before the running tracker is stopped; if
  a later step fails, the old tracker is started again.
* **`--autostart`** marks a logon start: when a tracker already runs it exits
  quietly (logging to `setup.log`, never `tracker.log`), unless the lock
  belongs to the old zip tracker whose Startup shortcut came back, which is
  retired so the installed exe tracks. A Start menu click while the tracker
  runs opens *Ustawienia* instead.
* **Supabase URL and key, automatically, only from the real site**: a window
  that finds nothing configured asks `DEFAULT_SITE`, never the `dashboard_url`
  of an old config (the zip era's `https://mindsetforest.app` is a domain
  nobody owns). Another site is asked only when typed under *Zaawansowane*
  and fetched with *Pobierz ustawienia*. The sign-in server's host is shown
  under the account fields.
* **Sign-in in the window** is always a fresh password sign-in. The window
  never refreshes the saved session, because Supabase rotates refresh tokens
  and would revoke the tracker's session if both used it. Each window keeps
  its sign-in in its own `session.new.<pid>.bin` until install moves it into
  `session.bin`, so closing a second window never drops it. When the tracker
  left its `needs_login` marker (the server refused the saved session), the
  window says *Logowanie wygasło* and shows the sign-in fields.
* **Recordings already in a newly chosen folder** are transcribed only when
  *Przetwórz też nagrania, które już są w folderze (N)* is ticked (ticked by
  default for a Bandicam folder). Otherwise `recordings_since` in config.json
  holds the cutoff and older files are skipped; an upgrade that keeps the
  folder keeps its cutoff.
* **Autostart** on an upgrade starts from the current state (the Run value or
  the zip version's Startup shortcut); only a fresh install starts ticked.
* **Upgrade** = run a newer setup exe; the data folder (device id, login,
  transcription state) is untouched. **Uninstall** = Apps & features or
  *Ustawienia... -> Odinstaluj...*; the vault and recordings are never deleted.
  With `--remove-data` (or *Tak* in the window) only the tracker's own files
  in the data folder go (`config.json`, `session*.bin`, `tracker.db`,
  `recordings.json`, `imports.json`, `tracker.log`, `setup.log`, lock and marker files); the
  folder itself only when nothing else is left in it. A running exe cannot
  delete itself, so after the last message box a hidden PowerShell cleanup
  waits for the uninstaller (and its onefile bootloader) to exit, then removes
  the exe and its folder.
* **The Claude routine is the one manual step.** The "Gotowe" page shows the
  steps and a copy button for the scheduled task's prompt
  (`Open my Obsidian vault at <vault>. Read _SYSTEM/routine-prompt.md and do
  exactly what it says.`). Without it transcripts pile up as `status: new`
  sessions; after 24 h the tracker reminds with a notification, at most once a
  day.
* **Command line** (CI and scripted installs): `--install --silent` with
  `--recordings DIR` / `--no-transcribe`, `--vault DIR`, `--hotkey SPEC`,
  `--no-autostart`, `--no-launch`, `--skip-existing` (only new recordings),
  `--site URL` or `--supabase-url URL --anon-key KEY`;
  `--uninstall [--silent] [--remove-data]`; `--settings`;
  `--self-test OUT.json` (Windows smoke checks). A silent install logs to
  `%APPDATA%\MindsetForest\setup.log`.

## Knowledge OS: imports and the routine's instructions

* **Imports** (`mindsetforest_tracker/imports.py`): every minute the tracker
  looks at `<vault>/Import/`. Each file or subfolder (up to 3 levels inside)
  is one source; names starting with `_`, `.` or `~$` are ignored. Supported:
  .txt .md .vtt .srt .docx (zipfile + XML) .pdf (pypdf; without it PDFs are
  skipped with a log line). In a subfolder a name containing "podsumowanie"
  or "summary" is the institution's summary, other .pdf/.docx are materials,
  the rest is the transcript (several transcript files are parts of one
  session). A source unchanged for a minute is hashed per transcript file
  (sha256; a hash known locally in `imports.json` or in `kos_recordings` is
  not imported again), stored in `kos_recordings` with `source = 'import'`
  and `original_name` (migration `20261015120000_kos_imports.sql`; until it
  is applied the row is stored without those two columns), and written as
  `Recordings/<note>.md` (`^tNNNN` = seconds for captions and text with
  times at line starts, else `^pNNNN` = paragraph), `Recordings/<note>
  (podsumowanie uczelni).md`, `Recordings/<note> (materiały).md` and a
  `Sessions/` note at `status: new` with `source: import` (or `youtube`).
  Then it moves to `Import/_done/`. Segments without times are
  `{"p": N, "start": null, "end": null, "text": ...}`. The date comes from a
  `YYYY-MM-DD` / `DD.MM.YYYY` (+ optional `HH-MM`) in the folder or file
  name, else the file time. A source that cannot be read gets one
  notification and waits until it changes; network errors retry in 10 min.
* **The routine's instructions** (`_SYSTEM/routine-prompt.md`,
  `_SYSTEM/processing-rules.md`) carry a `kos-format: 2` marker. The tracker
  (installer, first scan, each new session) writes them when missing,
  replaces a text a tracker shipped (`SHIPPED_TEXTS`: the sha256 of every
  earlier default, also the first format-2 prompt) with the current one,
  and replaces an edited older-format copy only after saving it as
  `<name> (moja wersja <date>).md`, then notes the upgrade in
  `_SYSTEM/routine-log.md` as a `> [!info]` line. Any other format-2 file
  is the user's and is never touched (`_SYSTEM/.kos-format` remembers that
  the vault reached format 2). The prompt asks for a lecture map (one
  mermaid block, at most 15 nodes) after "W skrócie", a folded
  `> [!important]- Do zapamiętania` callout before the glossary, and one
  course textbook per run (`Lectures/<Course>/_Podręcznik.md` or
  `_Textbook.md`, `type: course-textbook`) following
  `_SYSTEM/primer-prompt.md`. When the text changes, add the old text's hash
  to `SHIPPED_TEXTS` and a fixture in `tests/fixtures/`.
* **Study prompts** (`SyncWorker._pull_study_prompts`,
  `recordings.write_study_prompts`): after sign-in and then every 10 minutes
  the sync thread reads `user_context.learning_mode` and `.primer_prompt`
  with the user's token (migration `20261015180000_study_prompts.sql`) and
  writes `_SYSTEM/learning-mode.md` / `_SYSTEM/primer-prompt.md`
  (`source: dashboard` frontmatter + the text) when the text differs. An
  empty prompt leaves the file alone; a file without `source: dashboard` is
  saved as `(moja wersja <date>)` first; no other `_SYSTEM` file is
  written, and a missing vault is not created.
* **Routine log**: the routine keeps `last_run:` in the log's frontmatter
  (every run) and appends `## YYYY-MM-DD HH:MM` entries with `- sessions:`,
  `- summaries:`, `- notes:`, `- textbook:` and `- problems:` lines. The
  mirror copies the log as `_SYSTEM/routine-log.md`; past 64 kB only the
  frontmatter and the newest entries are sent.

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
     "dashboard_url": "https://hmqe333.github.io/mindsetforest_dashboard/",
     "idle_minutes": 3,
     "tick_seconds": 1,
     "sync_seconds": 60,
     "device_name": "",
     "min_session_seconds": 2,
     "ignored_apps": [],
     "private_keywords": [],
     "browser_domains": true
   }
   ```

   `config.json` is looked for next to the exe/script first, then in
   `%APPDATA%\MindsetForest\config.json` (a UTF-8 BOM, as written by
   PowerShell, is fine). `device_name` defaults to the computer name.
   `min_session_seconds` is the merge threshold described above.
   `browser_domains` names Chromium browser tabs by their domain (see Privacy). The anon
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
* The tracker saves the dashboard's active value into `capture_hotkey` in
  `config.json`, so the setup window always shows the hotkey in use. A hotkey
  changed in the window (*Zmień...* or *Wyłącz*) is pushed to the dashboard
  once (RPC `set_tracker_capture_hotkey`); after that the dashboard's value
  wins as above. An untouched hotkey is never pushed, so installing on a
  second PC keeps the account's hotkey.

## Where data lands

| what | where |
| --- | --- |
| local queue of sessions (SQLite) | `%APPDATA%\MindsetForest\tracker.db` |
| log (1 MB x 3, rotating) | `%APPDATA%\MindsetForest\tracker.log` |
| encrypted refresh token | `%APPDATA%\MindsetForest\session.bin` |
| single-instance lock | `%APPDATA%\MindsetForest\tracker.lock` |
| settings written by the installer | `%APPDATA%\MindsetForest\config.json` |
| hashes of imported transcripts | `%APPDATA%\MindsetForest\imports.json` |
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

* **No tray icon** - Windows 11 hides new icons under the **^** arrow next to
  the clock; otherwise check `tracker.log`. "Another tracker instance is
  already running" (in `setup.log`) means a second copy was started;
  `tracker.lock` holds the other process id. A lock left behind by a crash is taken over automatically
  (the pid must belong to a running tracker to count).
* **"Saved session unreadable ... moved to session.bin.bad"** - the token
  file could not be decrypted (copied from another PC/user, or corrupt). Sign
  in again from the tray.
* **"Not signed in" / balloon asking to sign in** - the saved token was
  rejected (password changed, session revoked, e.g. by signing out in the
  dashboard). Use *Sign in...* again, or *Ustawienia...*, which then says
  *Logowanie wygasło* and shows the sign-in fields.
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
* **Browser tabs named by title, not domain** - `tracker.log` says why ("UI
  Automation is unavailable", "Reading the address bar failed"). After a
  browser update run `python scripts\probe_omnibox.py` (from a source
  checkout): it opens Edge and Chrome on example.com with a throw-away profile
  and prints what the reader finds in the address bar (`--browser brave` for
  Brave).
* **Dev run on Linux/macOS** - the code imports without pywin32/pystray and uses
  a fake sampler; only the test-suite is meaningful there:
  `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt psutil requests pillow pypdf && python -m pytest -q`.

## Layout

```
tracker/
  mindsetforest_tracker/
    config.py     config.json loading/saving, data folder
    capture.py    win32 foreground/idle/lock sampling (FakeSampler elsewhere)
    browser_url.py  the active tab's domain from a Chromium address bar (UI Automation)
    normalize.py  app display name + app_key rules
    sessions.py   session state machine (idle, sleep gap, merging, 04:00 rule)
    store.py      SQLite queue (sessions + kv)
    auth.py       Supabase password/refresh auth, DPAPI-encrypted session file
    sync.py       background upload thread with back-off
    archive_capture.py  hotkey that saves the selected text to the Archive
    recordings.py Bandicam MP3 -> transcript -> vault, vault mirror, routine reminder, the routine's prompt
    imports.py    the vault's Import/ folder: .txt/.md/.vtt/.srt/.docx/.pdf -> sessions like recordings
    tray.py       pystray icon, menu, sign-in dialog
    winsetup.py   install / upgrade / uninstall, folder and vault detection
    setup_gui.py  the setup and "Ustawienia..." window (tkinter)
    main.py       wiring, single-instance guard, logging, setup dispatch
  tests/          pytest suite (runs on Linux)
  scripts/probe_omnibox.py  checks the address-bar reader on real Edge/Chrome (CI runs it)
  run_tracker.py  entry point for run-dev.bat and PyInstaller
  build-exe.ps1   builds dist\MindsetForestSetup.exe (build.bat runs it)
```
