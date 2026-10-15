# Knowledge OS routine

<!-- The scheduled task in Claude Desktop only says: read this file and do what it says.
     Edit this file to change how runs work; the task itself never needs changing. -->

This folder is my Obsidian vault. Recordings arrive as raw transcripts; you turn them into atomic,
linked knowledge notes. Write everything in English; quotes stay verbatim in the language spoken.

You only write files here. Nothing has to be sent anywhere: the MindsetForest tracker on this PC
copies `Knowledge/` and `Sessions/` to my dashboard within a minute of any change.

## 0. Start
1. Read `_SYSTEM/processing-rules.md`: my standing rules for good notes. This file is the procedure.
   If the two disagree on note format, keep the format in step 4 (the dashboard reads it).
2. If `_SYSTEM/routine.lock` exists and holds a time less than 3 hours ago, another run is going:
   reply "Already running" and stop. Otherwise write the current date and time into it.
   Delete it when you finish, also when you stop early.

## 1. Pick the work
- Notes in `Sessions/` with `status: new` in their frontmatter, oldest first (by file name).
  At most 3 sessions per run; the rest wait for the next run.
- The parts are listed between `<!-- kos:parts -->` and `<!-- /kos:parts -->`. If the frontmatter has
  `processed_parts: [1, 2]`, only the other parts are new (a session reopens when a new part is
  recorded); read the processed parts only for context.
- Nothing new: do only step 5.

## 2. Read and extract
- Read the new parts in order as one continuous text. Each line is `**[hh:mm:ss]** text ^tNNNN`,
  where NNNN is that segment's start in seconds.
- Whisper mishears words. Fix obvious mistakes in your own wording, never inside a quote. If a key
  term stays unclear, say so and use `confidence: low`.
- List candidate units, one idea each: concept, claim, principle, definition, model, example,
  observation, question, decision, contradiction, assumption. Skip small talk, logistics, repeats that
  add nothing, and private talk about other people. An hour of lecture is usually 5-20 units, not 50.
- No knowledge in the session at all (silence, music, a phone call): set `status: skipped`, write one
  line why under "## Knowledge", add its parts to `processed_parts`, move on.

## 3. Search before writing
For each unit, search the whole vault except `Recordings/` and `_SYSTEM/` (titles and text, with
synonyms), then:
- **Same idea already in `Knowledge/`**: extend that note. Add the source to `sources`, add the quote,
  add one line on what the new recording adds. Change its statement only if it was wrong, and say so.
- **Similar but different**: a new note; link both ways, saying how they differ.
- **Conflicts with a note**: a `contradiction` note linking both sides, each with its quote. Do not
  decide who is right.
- **My own notes elsewhere in the vault**: link to them; never edit them.

## 4. Write
One file per unit in `Knowledge/` (subfolders are fine), exactly in this shape:

    ---
    type: principle
    sources: ["[[Recordings/<recording note name>#^t0750]]"]
    confidence: high
    created: YYYY-MM-DD
    ---
    # Reciprocity

    One to four sentences in your own words.

    > "Verbatim words from the transcript." ([[Recordings/<recording note name>#^t0750]])

    Related: supports [[Commitment]]; example of [[Influence]].

- File name = the title: short, unique, English, only letters, digits, spaces, hyphens, commas,
  apostrophes and parentheses.
- Every `^tNNNN` you cite must exist in that recording file: copy it from the line, never compute it.
- `sources` is a list of quoted strings and the frontmatter must stay valid YAML.
- When 3 or more notes share a concept, keep a `concept` hub note linking them, one line each on how
  it relates (a map, not merged text).
- A session that continues an earlier one (same course, same topic picked up again) gets
  `continues: "[[Sessions/<earlier session>]]"` in its frontmatter.

Then update the session note:
- under "## Knowledge" one line per note: `- [[Note]] (new)` or `- [[Note]] (extended)`;
- in the frontmatter: `topic: <3-8 words>`, `processed_parts: [<every part done>]`, `status: processed`.
Never change the `<!-- kos:parts -->` block or anything in `Recordings/`.

## 5. Gardening (every run, keep it short)
Only notes created or changed in the last 7 days:
- add missing links between them (same concept, cause and effect, example of, part of);
- a duplicate made by mistake (truly the same idea, not just similar): merge into one note keeping
  every source and quote, point links at the kept note, and move the other file to
  `_SYSTEM/merged/` with one line `Merged into [[Kept note]]`. Never delete files;
- an open `question` that a newer recording answers: link the answer and add
  `answered_by: "[[Answer note]]"` to the question's frontmatter.

## 6. Check, log, reply
- Check every file you wrote: the frontmatter parses, each cited `^tNNNN` exists in its recording, every
  `[[link]]` points to a note that exists, nothing in `Recordings/` changed. Fix what fails.
- Append to `_SYSTEM/routine-log.md`: date and time, sessions processed, notes new / extended,
  anything that went wrong.
- Reply briefly: sessions (topic), notes created and extended (names), contradictions found, and
  anything you were unsure about.
