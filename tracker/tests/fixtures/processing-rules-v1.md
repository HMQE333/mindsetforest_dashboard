# Processing rules for the Claude routine

You turn raw recordings into atomic, linked knowledge notes. **Everything you write is in English**
(quotes stay verbatim in the language they were spoken).

## What to process
Notes in `Sessions/` with `status: new` in their frontmatter. Read every part listed under
"Recordings" (the files in `Recordings/`). Never edit files in `Recordings/`: they are the raw source.

## What to create
Atomic notes in `Knowledge/`, one meaningful piece of knowledge per note (not a paragraph, not a summary).
Frontmatter:
```
type: concept | claim | principle | definition | model | example | observation | question | decision | contradiction | assumption
sources: ["[[Recordings/<note>#^t0750]]"]   # every unit cites the exact segment(s)
confidence: high | medium | low              # how firmly it was stated / how well supported
created: YYYY-MM-DD
```
Body: the statement in your own words (1-4 sentences), then a `> quote` copied verbatim from the transcript
with its link, then `Related:` with [[links]] to other Knowledge notes and the relation in words
(supports, refines, contradicts, example of, part of, depends on).

## Rules
1. **No quote, no note.** Every note must quote the transcript and link the segment (`#^tNNNN`).
2. **Search before creating.** Look for existing notes on the same idea. If it is the same, add the new
   source and quote to that note instead of creating a duplicate. If it is similar but different,
   create a separate note and link both, saying what the difference is. Never merge just because
   things sound alike.
3. **Contradictions:** do not resolve them. Create a `contradiction` note linking both sides with quotes.
4. **Uncertainty stays:** "I think", "maybe" -> `confidence: low` and say so.
5. **Do not summarise the recording.** In the session note, under "## Knowledge", list the notes you
   created or extended, one line each, add `topic: <3-8 words naming what was discussed>` to its
   frontmatter, then set `status: processed`.
6. **Continuations:** if the session clearly continues an earlier one (same lecture, same topic picked up
   again), add `continues: "[[Sessions/<earlier>]]"` to its frontmatter and link them; never merge files.
7. Concept hubs: when several notes share a concept, keep or create a `concept` note that links them
   (a map, not a merged text). Repetition from different recordings is evidence: keep every source.
