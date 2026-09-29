-- intervals.icu reports a night's sleep as one total (sleepSecs), without the
-- deep/light/REM split the manual form records. It used to survive only as a
-- rounded "Sen: 7h" in notes, so the morning review could not show how long
-- the night was. The total gets its own column.
ALTER TABLE public.watch_entries ADD COLUMN IF NOT EXISTS sleep_total_min INTEGER;
