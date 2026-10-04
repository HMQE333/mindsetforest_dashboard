#!/usr/bin/env bash
# Installs the APK on a running emulator and checks it the way a person would:
# first launch, the dashboard's setup link, usage access, the "today" card.
# Run by .github/workflows/android.yml; screenshots and UI dumps go to smoke/.
set -euo pipefail
APK="$1"
PKG=app.mindsetforest.phone
OUT=smoke
mkdir -p "$OUT"

adb wait-for-device
adb install -r "$APK"
adb logcat -c

dump() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null
  adb shell cat /sdcard/ui.xml > "$OUT/$1.xml"
  adb exec-out screencap -p > "$OUT/$1.png"
}

expect() {
  if grep -q "$2" "$OUT/$1.xml"; then
    echo "ok: $1 shows '$2'"
  else
    echo "FAIL: '$2' is not on the screen ($1). On screen:"
    grep -o 'text="[^"]*"' "$OUT/$1.xml" | grep -v 'text=""' || true
    exit 1
  fi
}

# 1. First launch: the three steps, nothing connected yet.
adb shell am start -W -n "$PKG/.MainActivity"
sleep 3
dump first
expect first "Połączenie z dashboardem"
expect first "Nadaj dostęp"

# 2. The dashboard's "Połącz telefon" link fills in the connection.
adb shell "am start -W -a android.intent.action.VIEW -d 'mindsetforest://setup?url=https%3A%2F%2Fexample.supabase.co&key=test-key'"
sleep 2
dump linked
expect linked "Połączono z example.supabase.co"

# 3. Usage access (set the way the Settings switch does), then time in another app.
adb shell appops set "$PKG" GET_USAGE_STATS allow
adb shell am start -W -n com.android.settings/.Settings
sleep 8
adb shell am start -W -n "$PKG/.MainActivity"
sleep 4
dump today
expect today "Dostęp nadany"
expect today "Dziś na telefonie"
expect today "Settings"

# 4. No crash at any point.
if adb logcat -d | grep -E "FATAL EXCEPTION|Process: $PKG"; then
  echo "FAIL: the app crashed"
  exit 1
fi
echo "Smoke test passed"
