# MindsetForest: plan porządków i integracji Minute Trackera

Stan na 28 września 2026. Baza kodu: gałąź `server-current` (Paths z 29 sierpnia).
Projekt Supabase: "Mindsetforest App" (`ozmephoezqjlblamwrnk`). Aplikacja wdrożona na własnym hostingu.

## 1. Ustalenia z właścicielem

- Rdzeń aplikacji: Home, Stats, Archive, Forest, Oracle, Library. Reszta to chowalne dodatki, nic nie usuwamy poza aplikacją mobilną Expo.
- Kierunek: AI świadome produktywności użytkownika, dashboard jako interfejs do życia, Archive jako drugi mózg. Forest ma być zbiorową wiedzą dla wielu użytkowników.
- Kategorie: osiem dziedzin życia w obecnych nazwach. Projekty jako osobne foldery. Bez zmian.
- Dzień kończy się o 4:00 rano. Jedna wspólna funkcja "dzisiaj" dla Home, Stats, Paths i danych z komputera.
- Streak: dwa zamrożenia odnawiane co tydzień.
- XP to postęp, który można poświęcić w Oracle. Planning, Paths i pozostałe moduły nie dają XP, chyba że coś zamienia się w misję na Home. XP ze Stats: do rozstrzygnięcia osobno.
- Reset Day bez zmian.
- Stats to główny problem produktowy: które drobne, obiektywne działania nagradzać, czy pozwolić definiować własne, co z XP po zmianie nazwy lub usunięciu metryki, szybki obraz "robiłem 50 pompek codziennie".
- Minute Tracker: headless agent na Windowsie z autostartem, sync co minutę, pełne tytuły okien w bazie za zgodą użytkownika, wszystkie zakładki i funkcje trackera odwzorowane w webie. Użytkownik sam definiuje grupy, AI wstępnie sortuje. Warstwa analityczna, bez XP na start. Koszt AI poniżej 5 USD miesięcznie na użytkownika.
- Bezczynność: brak klawiatury i myszy przez dłuższy czas kończy sesję, blokada i uśpienie to "away", z wyjątkiem klas typu "oglądanie", gdzie brak wejścia jest normalny. Okno można oznaczyć jako "nie śledź".
- Dane drabinek i habit loopów mogą zostać skasowane. Migracja Paths zostaje w obecnej formie.
- Intervals.icu: bez automatyki, ma działać tylko zapis tokena.

## 2. Porządki w repo, w kolejności

### 2.1 Struktura i źródło prawdy

1. `main` = to, co jest wdrożone. Scalić `server-current` do `main`. Gałąź `claude/dashboard-ai-chat-schemes` z 4 września cofa Paths, więc jej nie scalamy w całości; jej moduł Planning Simulations i pasek faz energii ocenić osobno i ewentualnie przenieść na Paths.
2. Usunąć martwe drzewa: katalog główny `src/` z Lovable, `.migration-backup/` po skopiowaniu 54 oryginalnych migracji do `supabase/migrations/`, `artifacts/api-server`, `artifacts/mockup-sandbox`, `lib/*`, `scripts/`, `bun.lock`, `artifacts/app-mobile`.
3. Jeden katalog migracji `supabase/migrations/`, jeden plik typów `artifacts/app/src/integrations/supabase/types.ts` wygenerowany z bazy. Naprawić dwa pliki migracji z tym samym numerem wersji.
4. `.env` wskazuje na projekt z Lovable. Zastąpić go `.env.example`, sam `.env` usunąć z repo. Wpisy w `.replit` z kluczami usunąć.
5. Typecheck ma przechodzić. Dziś 36 błędów. Naprawić prawdziwe błędy, dostosować `tsconfig` do reszty.
6. Konfiguracja wdrożenia: usunąć `vercel.json` i konfigurację Replit, opisać w README, że build to `pnpm build` w `artifacts/app` i wynik trafia na hosting.

### 2.2 Błędy do naprawy w istniejącym kodzie

Home i XP:
- Zmiana dnia sprawdzana tylko przy ładowaniu. Wprowadzić wspólne `todayKey()` z granicą o 4:00 i sprawdzać przy każdym ukończeniu.
- Misje identyfikowane pozycją w tablicy. Nadać misjom stałe `id`, przepisać `completedMissions` i `rolledVariants` na id, zmigrować istniejący blob.
- Klawisze 1 do 9 używają innego indeksu niż klik i nie liczą wariantu XP.
- Dzienny snapshot do `daily_completions` liczy XP z bazowej definicji misji, nie z wariantu, i indeksuje przefiltrowaną listę.
- Streak: nowy użytkownik zaczyna od 1, streak nigdy nie spada. Wprowadzić dwa zamrożenia tygodniowo.
- Cofnięcie kroku Paths nie oddaje XP na zakładce Paths i nie odwraca licznika misji, streaka i zaangażowania kategorii. Cofnięcie odejmuje XP nawet bez wpisu.
- Kropka jako czas trwania misji zapisywana do bazy. Wyczyścić kod i dane.
- People i Spirit mają ten sam kolor. Dokończyć zmianę nazw kategorii w CSS, skrótach, mapie kolorów metryk i promptach edge functions.

Stats:
- Wpisy kluczowane dniem UTC. Przejść na wspólne `todayKey()`.
- Zakładka Stats XP w ustawieniach pokazuje domyślne wartości i nadpisuje zapisane.
- Pierwszy zapis w Metrics tworzy metryki na nowo z nowymi id, przez co historia znika z kart. Ujednolicić: metryki zawsze w tabeli `user_metrics`, domyślne seedowane przy pierwszym wejściu, karty czytają z tabeli.
- Losowe dane w wykresie 12 miesięcy. Usunąć.
- Heatmapa sumuje godziny, pompki i strony jako "units". Liczyć liczbę wpisów albo znormalizowany udział metryki.
- Brak limitu wierszy przy pobieraniu historii, cichy limit 1000 wierszy. Zakresy dat.
- Grant XP nie wskazuje wpisu, więc nie da się cofnąć pojedynczego logu. Dodać `entry_id` do grantów.
- XP za wpis dodawane nawet, gdy zapis wpisu się nie udał.

Asystent:
- Sześć zakresów kontekstu czyta kolumny, których nie ma: breathing, calendar, cooking, library, plus stare ladder i habit. Naprawić na kolumny z typów, library ma czytać książki i kursy.
- Planner czyta kalendarz kolumną `event_date`, ma być `date`.
- Zakresy wybierane raz na sesję, nie podążają za nawigacją. Mapa zakładek na zakres ma 8 z 13 pozycji.
- Zadania i mapy myśli tworzone przez asystenta lądują bez boardu i są niewidoczne w Planning.
- "Applied N actions" liczy błędnie, "Sources" to echo zaznaczonych zakresów.
- Mikrofon woła funkcję `ai-transcribe`, której nie ma. Napisać funkcję na Whisper przez OpenAI albo usunąć przycisk.

Ustawienia:
- `useUserSettings` to 14 niezależnych kopii, każda robi 3 zapytania. Zamienić na provider z jednym stanem, przy zachowaniu animacji wczytywania na Home.
- Skróty klawiszowe działają pod otwartymi modalami, R resetuje dzień bez potwierdzenia.
- Jedyny przycisk wylogowania jest na stronie Stats. Dodać w nagłówku.
- Zapis kolorów projektów wskazuje nieistniejące zmienne CSS i nie jest odczytywany.
- Intervals.icu: zapis tokena bez wołania funkcji, przycisk pobierania usunąć.

Archive i Forest:
- Archiwum odpytywane co 5 sekund z kolumną embeddingów. Wrócić do cache i odświeżania na żądanie plus zdarzenie zmiany.
- `useForestState` montowany w 10 komponentach, każda kopia zabija kanał realtime poprzedniej. Jeden provider dla Forest.
- Przycisk "Water" nie odświeża karty.
- Inbox "Tag" woła nieistniejącą funkcję `ai-suggest-tags`. Przywrócić oryginalne "Organize + Save" albo napisać funkcję.
- File Share wrzuca pliki do publicznego bucketu i kasuje je timerem w przeglądarce. Prywatny bucket, signed URL, kasowanie po stronie serwera.
- Digest: notatki nigdy nieprzejrzane wpadają do powtórek tylko w wybranych dniach, po 91 dniach nigdy.
- Prompty edge functions dla pillarów używają starych id.

Finance:
- Import wyciągu woła nieistniejącą funkcję `ai-finance-import`. Napisać: parser CSV po stronie klienta, AI tylko do kategoryzacji wierszy.
- Transakcje wskazują kategorie po nazwie, zmiana nazwy osieroca wiersze. Przejść na id.
- Subskrypcje liczone raz, nie co miesiąc. Pożyczki dane i wzięte sumowane razem, rozliczone znikają.
- Waluta: dolar w finansach, euro w gotowaniu, PLN w imporcie. Jedno ustawienie.

Health:
- Daty w modalach przez UTC, wpis ląduje dzień wcześniej i nadpisuje inny dzień.
- Wgrane PDF badań nigdy nie są pokazywane.
- Domyślny tryb Watch, gdy tabela może nie istnieć. Domyślnie Labs, Watch po wykryciu tabeli.

### 2.3 Baza danych do sprawdzenia na projekcie produkcyjnym

Wymaga dostępu przez Management API. Do ustalenia: które migracje wykonano, czy istnieją `paths`, `path_steps`, `path_step_logs`, `user_context`, `ai_suggestion_log`, `path_revisions`, `planning_boards`, `watch_entries`, `bookmarks`, które edge functions są wdrożone i jakie sekrety ustawione, czy w danych są stare id kategorii, oraz usunięcie testowych znajomych z migracji Lovable.

## 3. Minute Tracker: architektura

Zasada: komputer zbiera i nazywa, web klasyfikuje, uczy się i pokazuje. Jeden pisarz na tabelę: agent pisze tylko do tabel użycia, web tylko do klas i reguł.

### 3.1 Agent na Windowsie

- Headless, tray z pystray, autostart z systemem, przycisk pauzy i "nie śledź tego okna".
- Próbkowanie co sekundę jak dziś, ale: tytuł odświeżany co tick i podział sesji przy zmianie tytułu, czas startu sesji zapisywany jako start, nie koniec, wykrywanie bezczynności przez `GetLastInputInfo` z progiem 3 minut, obsługa blokady sesji i uśpienia, zrzut bieżącej sesji przy zamknięciu.
- Identyfikacja: proces plus tytuł. Do bazy idą trzy pola: `app` (nazwa procesu po aliasach), `app_key` (klucz niskiej kardynalności: dla IDE "App | projekt", dla przeglądarki "Browser | serwis", dla reszty nazwa aplikacji) i pełny `window_title`.
- Sync co minutę: nowe wiersze od kursora `last_synced_id` do tabeli sesji, upsert po `(user_id, device_id, started_at)`. Kolejka offline to lokalny SQLite. Pierwszy sync wysyła ostatnie 30 dni.
- Logowanie e-mail i hasło do Supabase przez REST, refresh token zaszyfrowany DPAPI, klucz anon i URL w pliku konfiguracyjnym obok exe. Pisze pod RLS jak aplikacja webowa.
- Lokalne GUI trackera przestaje być rozwijane. Foldery, reguły i aliasy z jego SQLite są wysyłane raz jako propozycje klas i reguł do przejrzenia w webie.

### 3.2 Tabele w Supabase

- `app_usage_sessions(id, user_id, device_id, app, app_key, window_title, started_at, ended_at, seconds, local_date, idle bool)` z unikalnością `(user_id, device_id, started_at)` i indeksem `(user_id, local_date)`. Około tysiąca wierszy dziennie.
- `app_usage_daily` jako widok albo tabela odświeżana przez agenta: `(user_id, device_id, local_date, app_key, seconds)`.
- `app_classes(id, user_id, name, kind in work|learning|communication|waste|neutral|watching, pillar_id, project_id, keywords[], color, sort_order, count_idle bool)`. Domyślne klasy seedowane przy pierwszym wejściu. Klasa "watching" zlicza czas mimo braku wejścia.
- `app_rules(id, user_id, match_kind in exact|substring|domain|regex, pattern, field in app|app_key|title, class_id, project_id, priority, source in manual|label|learned|suggested, confidence, enabled, hits, last_hit_at)`.
- `local_date` liczony z granicą dnia o 4:00, jako tekst `YYYY-MM-DD`.

### 3.3 Klasyfikacja i uczenie w webie

Czysta funkcja `classify(session, ctx)` z kolejnością: reguły włączone po priorytecie, potem słowa kluczowe klas i nazwy projektów w tytule, potem prior per aplikacja z historii, potem "nieprzypisane". Trzy poziomy pewności w UI.

Uczenie: wybór klasy dla aplikacji tworzy regułę ze źródłem `label`. Po poprawce web proponuje regułę szerszą ("zawsze traktuj GitHub jako pracę nad projektem X"), zaakceptowana ma źródło `learned`. Nic nie stosuje się bez zgody. Priory z pory dnia i dnia tygodnia jako podpowiedź, nie decyzja.

AI: jedna funkcja `ai-classify-usage` przez OpenRouter, wołana ręcznie lub raz dziennie dla nieprzypisanych kluczy z ponad 10 minutami. Wejście: do 40 kluczy z próbką tytułów i listą klas i projektów użytkownika. Wyjście: propozycje ze źródłem `suggested`. Koszt przy modelu klasy Gemini Flash to grosze miesięcznie.

### 3.4 Interfejs w Stats

Nowa sekcja "Komputer" na stronie Stats, odwzorowująca zakładki trackera: Dashboard z kafelkami per rodzaj, donutem klas i słupkami top aplikacji, Timeline dnia z minutowymi sesjami, Tygodniowy trend, All time, Foldery jako klasy z rozwijaniem per aplikacja, Apps jako zarządzanie regułami i aliasami. Filtry: zakres dat, klasy, aplikacje, minimalny czas. Dodatkowo wskaźnik skupienia dnia, porównanie z medianą tych samych dni tygodnia i callout "nieprzypisane".

### 3.5 Asystent

Nowy zakres kontekstu "komputer": sumy per rodzaj i projekt za 7 i 30 dni, top aplikacje, nieprzypisane, najlepszy i najgorszy dzień. Linia "czas przy ekranie dzisiaj" w builderze kontekstu planera. Akcja `set_app_class` przez istniejącą kartę potwierdzenia. Pętla akceptacji propozycji przez `ai_suggestion_log` ze scope `usage`.

### 3.6 XP

Faza późniejsza, za przełącznikiem per klasa: klasa związana z metryką godzinową zapisuje jeden wpis w `tracker_entries` dziennie i jeden grant XP dziennie, tylko rodzaj "work", nigdy ujemnie. Wymaga wcześniejszej naprawy dnia w Stats.

## 4. Kolejność prac

1. Dostęp do bazy i inwentaryzacja produkcji, scalenie `server-current` do `main`, usunięcie martwych drzew, jeden katalog migracji, typecheck zielony.
2. Wspólny `todayKey()` z granicą 4:00 i naprawy Home, Stats, Paths z listy 2.2.
3. Migracja tabel użycia, agent w Pythonie z syncem, sekcja "Komputer" w Stats w wersji podstawowej: kafelki, timeline, top aplikacje, przypisywanie klas.
4. Reguły, uczenie, zarządzanie klasami, tray i autostart, import folderów z trackera.
5. Zakres asystenta, funkcja AI do klasyfikacji, naprawa zepsutych zakresów asystenta, brakujące funkcje: transkrypcja, import wyciągów, tagi w Inbox.
6. Pozostałe porządki z 2.2: Forest provider, archiwum bez pollingu, finance, health, ustawienia jako provider.

## 5. Status (28 września 2026, wieczór)

Wykonane na gałęzi `claude/gracious-clarke-bun1qo` (baza: `server-current`):

- Etap 1: repo skonsolidowane (jeden katalog migracji, typy z produkcji, 440 martwych plików usuniętych, typecheck zielony, build i testy przechodzą). Cztery funkcje odzyskane z produkcji do `supabase/functions`.
- Produkcja: wykonane migracje kontekstu użytkownika, silnika Paths i tabel czasu przy komputerze. Wdrożone aktualne `ai-mission-suggest` i `ai-path-suggest` z plannerem.
- Etap 2: granica dnia o 4:00 (`lib/today.ts`), rollover dnia na Home, streak z dwoma zamrożeniami tygodniowo liczony z historii, cofanie kroków Paths z XP, zakładka XP w ustawieniach, wykres roczny bez losowych danych, zakresy asystenta (breathing, calendar, cooking, library), kropki po myślnikach, kolor Spirit, wylogowanie w nagłówku, skróty pod modalami, potwierdzenie resetu dnia.
- Etap 3: agent `tracker/` (Python, 104 testy) i sekcja "Komputer" w Stats z klasyfikacją, folderami, regułami i uczeniem (po recenzji i poprawkach).
- Presety misji: tabela `mission_presets` (migracja wykonana na produkcji), pasek presetów nad Home (zapisz obecne, załaduj, aktualizuj, zmień nazwę, kolejność, usuń) i akcja asystenta `apply_preset` ("włącz monk mode" na czacie, z potwierdzeniem). Załadowanie nadpisuje wszystkie listy misji i czyści dzisiejsze odhaczenia; XP zostaje.
- Asystent: auto-kontekst (router `google/gemini-2.5-flash` dobiera sekcje do pytania, przypięte sekcje zawsze zostają), model czatu `anthropic/claude-haiku-4.5` (sekret `ASSISTANT_MODEL`; Sonnet 5.5 dla najwyższej jakości) z limitem `ASSISTANT_BUDGET_USD` (domyślnie 10 USD/mies., potem `google/gemini-2.5-flash`), logowanie kosztów w `ai_usage_log` (migracja `20260928200000_ai_usage_log.sql`, wymaga wykonania na produkcji), tryb rozmowy głosowej w przeglądarce (Web Speech API, bez kosztów), akcje `navigate` (otwiera moduł bez potwierdzenia) i `complete_mission` (odhacza misję po tytule), lista dzisiejszych misji w kontekście. Funkcja `ai-assistant-chat` wdrożona (v4).
- Presety: wybór jako karty w oknie dialogowym, jeden przycisk w nagłówku Home.
- Stats XP (decyzja 29.09): ta sama reguła za wpis co wcześniej, bez dziennego limitu; plakietka z sumą XP w nagłówku Stats usunięta. Pole limitu zniknęło z Ustawienia -> Stats XP.
- Zegarek (decyzja 29.09, zmienia wcześniejsze "bez automatyzacji"): aplikacja sama pobiera dane z intervals.icu, gdy ostatni import ma ponad 2 h (przy otwarciu, powrocie do karty, odzyskaniu internetu i co 30 min). Serwerowy harmonogram (pg_cron) nie jest włączony; nie był potrzebny, bo wszystko, co czyta dane zegarka, działa przy otwartej aplikacji.
- Paths: jedno wejście do AI, przycisk "Ask AI" otwiera asystenta (szkic lub przeróbka planu jako revise_path, nowa ścieżka jako create_path). Modal AIPathModal usunięty; funkcja ai-path-suggest zostaje na serwerze, nieużywana.
- Asystent steruje aplikacją: navigate, open_settings, set_theme (bez potwierdzenia); toggle_module, complete/uncomplete/edit/remove_mission, save_preset, apply_preset, log_metric, log_path_step, create_path, revise_path, complete_task, add_event, add_transaction, add_task, add_note, mindmapy (z potwierdzeniem). Zapisy spoza stanu Home idą przez lib/assistant-writes.ts i emitują zdarzenia z lib/app-events.ts, na które odświeżają się otwarte strony.
- Podsumowanie dnia i miesiąca (29.09): rano przy pierwszym otwarciu Home popup z jednym ekranem wskaźników z wczoraj (XP i misje, praca i nauka z fokusem, rozproszenia, sen z ostatniej nocy, ścieżki, wydatki, pasek czasu przy komputerze), potem 3 pytania od AI (ai-review) z gotowymi odpowiedziami do kliknięcia i nagrywaniem głosu. W pierwszych 10 dniach miesiąca to samo dla poprzedniego miesiąca (5 pytań). Odpowiedzi w tabeli `reviews` (migracja 20260929120000_reviews.sql, wykonana), trafiają do kontekstu plannera i asystenta. Seria dni z podsumowaniem, przycisk 📋 w nagłówku Home, "Później" odkłada do jutra, przełącznik auto-otwierania w popupie.
- Głos asystenta: funkcja `ai-tts` (ElevenLabs, sekret `ELEVENLABS_API_KEY`, opcjonalnie `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`); bez klucza działa głos przeglądarki. Zużycie znaków trafia do `ai_usage_log` (koszt 0, rozliczany w planie ElevenLabs).
- Paths: każda ręczna zmiana planu (nazwa kroku, etap, liczba dni, dodanie, usunięcie, kolejność, nazwa ścieżki) zapisuje wersję w historii; edycje w ciągu 10 minut łączą się w jedną sesję z listą powodów. Przepisanie przez asystenta dopasowuje kroki po tytule, więc nie duplikuje zachowanych kroków; kroki z logami trafiają na koniec listy.
- Library, pliki książek (29.09): PDF upuszczony na kartę książki, w okno książki albo na tło Library (wtedy dopasowanie po tytule w nazwie pliku) trafia do prywatnego bucketu `library-files` jako `<user>/<book>/<stamp>.pdf`; obok zapisuje się wyciągnięty tekst (`.txt`, strony rozdzielone `\f`) na przyszłe operacje (AI, wyszukiwanie, cytaty). Skany bez warstwy tekstu są oznaczane. Czytnik w aplikacji (pdf.js, ładowany dopiero przy otwarciu) pamięta stronę i przesuwa postęp książki (proporcjonalnie, tylko do przodu; pierwsza przeczytana strona zmienia status na "Reading"). Metadane w `user_books.file` (jsonb). Migracja `20260929180000_library_files.sql` wykonana na produkcji. OCR skanów jeszcze nie ma.
- Podgląd testowy: `pnpm preview:build` buduje wersję z hash-routingiem do `artifacts/app/dist-preview`; gałąź `preview-build` trzyma gotowy build dla GitHub Pages (adres `https://hmqe333.github.io/mindsetforest_dashboard/`, wymaga włączenia Pages w ustawieniach repo: branch `preview-build`, folder root).

Do zrobienia (kolejność wg rozdziału 4):

- Etap 4: tray i autostart są w agencie; import folderów ze starego trackera pominięty na życzenie właściciela. Do dopracowania po pierwszym tygodniu prawdziwych danych: normalizacja kluczy przeglądarki i priory z pory dnia.
- Etap 5: zakres "Komputer" dla asystenta jest zarejestrowany; funkcja AI do klasyfikacji nieprzypisanych kluczy (`ai-classify-usage`) jeszcze nie napisana. Transkrypcja, import wyciągów i tagi w Inbox są wdrożone na produkcji i mają kod w repo.
- Etap 6: Forest jako jeden provider, archiwum bez odpytywania co 5 s, finanse (kategorie po id, subskrypcje miesięczne, waluta), health (PDF badań, tryb domyślny), ustawienia jako provider, stałe id misji zamiast pozycji na liście.

Po stronie właściciela:

1. `main` jest aktualny. Do hostingu produkcyjnego: `pnpm install && pnpm build` (wynik w `artifacts/app/dist`). Do testów: włączyć GitHub Pages z gałęzi `preview-build`.
2. Na komputerze z Windows: `tracker/README.md`, szybki start po polsku. Pierwsze uruchomienie przez `run-dev.bat` z konsolą, potem `install-autostart.bat`.
3. W Stats, sekcja "Komputer", zakładka "Foldery": przypisać pierwsze aplikacje do klas; propozycje reguł pojawią się po każdej korekcie.
