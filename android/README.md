# MindsetForest Phone (Android)

> **Szybki start (PL)**
>
> 1. Na telefonie otwórz dashboard → Stats → **Komputer i telefon** → **Pobierz aplikację (APK)** i zainstaluj.
> 2. Wróć do tej samej sekcji i stuknij **Połącz telefon**: aplikacja dostaje adres bazy.
> 3. W aplikacji **Nadaj dostęp** (Ustawienia → Dostęp do danych o użyciu → MindsetForest) i zaloguj się tym samym e-mailem i hasłem co w dashboardzie.
>
> Potem nic nie trzeba robić: co ok. 15 minut aplikacja wysyła sesje w tle. Czas z telefonu sumuje się z komputerem; filtr urządzeń w Stats pokazuje je osobno (📱 model telefonu).

The phone counterpart of `tracker/` (the Windows agent). It writes the same
rows to `public.app_usage_sessions`, so the dashboard's classes, rules and
charts work on phone time with no changes.

## How it works

- **No watching, no foreground service.** Android keeps a few days of
  foreground events (`UsageStatsManager.queryEvents`). A `JobScheduler` job
  runs every ~15 minutes with a network, reads the events since its cursor,
  rebuilds sessions and upserts them. If Android delays the job, nothing is
  lost; the next run reads what the system kept.
- **Sessions** (`Sessions.kt`, pure Kotlin): an app's time runs from
  `ACTIVITY_RESUMED` to its `ACTIVITY_PAUSED`; activities inside one app
  within 2 s stay one session; screen off, the lock screen, the launcher and
  the system UI end it; visits under 2 s are dropped; a session never spans
  04:00 local (the dashboard's day start). The app still in front is sent as
  an open session up to "now" and updated on the next run.
- **Rows**: `app` = the app's name, `app_key` = the package name,
  `window_title` = the app's name (so keyword rules like "tiktok" match a
  package called `com.zhiliaoapp.musically`), `idle = false`,
  `device_id = android:<model>:<ANDROID_ID>`. The upsert key is
  `(user_id, device_id, started_at)`, so re-sending the same events updates
  the same rows. The server's privacy trigger drops private apps as it does
  for the computer.
- **Reinstalls** keep `ANDROID_ID` when the APK is signed with the same key,
  so they land on the same rows. With a different key `ANDROID_ID` changes;
  the first sync then asks the server for the newest row of this phone model
  (`android:<model>:*`) and starts after it, so no day is counted twice.
- **Sign-in** is Supabase's password grant. Tokens are encrypted with an
  Android Keystore key; backups are off, so a restored phone signs in again.
- **Setup link**: the dashboard's "Połącz telefon" button opens
  `mindsetforest://setup?url=<supabase url>&key=<publishable key>` (as an
  `intent://` URL with the APK as Chrome's fallback). Both values are public;
  the user's login is what RLS checks.
- **"Dziś na telefonie"** on the app's screen sums today's sessions locally,
  so it is plain what gets recorded.

## Build

Needs JDK 17+ and the Android SDK (platform 36). From `android/`:

```bash
./gradlew testReleaseUnitTest assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../artifacts/app/public/downloads/mindsetforest-phone.apk
```

The APK in `public/downloads` ships with the site (GitHub Pages preview).
Bump `versionCode` in `app/build.gradle.kts` for every published build.

### Signing

The repo is public, so no signing key lives here. `MF_KEYSTORE` (path to a
PKCS12 file, alias `mindsetforest`) and `MF_KEYSTORE_PASSWORD` select the
release key; without them the build is signed with the local debug key. Such
an APK installs and works, but Android only updates an installed app with an
APK signed by the same key; otherwise uninstall first (then sign in again; the
reinstall rule above keeps the data clean).

A release key was generated on 2026-10-04 and stored in the project's
Supabase Vault (`android_release_keystore`, base64 PKCS12, and
`android_release_keystore_password`). The published APKs are not signed with it
yet: using it is the owner's decision.

## Tests

- `./gradlew testReleaseUnitTest`: session building, the 04:00 split, the
  cursor, token refresh and sign-out rules, first-sync dedupe, and the HTTP
  calls against a local server (24 tests).
- `.github/workflows/android.yml` runs them on every change under `android/`,
  then installs the APK on an Android 14 emulator and runs `smoke-test.sh`:
  first launch, the setup link, usage access, and the "today" card listing
  time spent in Settings. Screenshots are kept as the `android-smoke` artifact.
