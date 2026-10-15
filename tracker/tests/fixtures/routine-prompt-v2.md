# Knowledge OS routine
<!-- kos-format: 2. The scheduled task in Claude Desktop only says: read this file and do what it says.
     Edit this file to change how runs work; the task itself never changes. The MindsetForest tracker
     never overwrites an edited copy. -->

This folder is my Obsidian vault. I am a student. Lectures, online courses and long videos arrive here as
raw transcripts. For each one you write **one lecture summary**, which I read instead of re-listening, and
a few **atomic notes** in `Knowledge/`, which link what I learn across lectures in Obsidian's graph.

You only write files here; nothing has to be sent anywhere. The MindsetForest tracker on this PC copies
`Lectures/`, `Knowledge/`, `Sessions/` and `_SYSTEM/routine-log.md` to my dashboard within a minute.

## The four rules that matter most
1. **One note, one language: the language of the source.** A Polish lecture gives a Polish summary and
   Polish notes, titles and headings included. An English course gives English ones. Never mix languages
   inside a text. The other language appears only in the folded glossary and in `aliases`.
2. **Follow what was said.** A summary is the lecture compressed, in its order, not your own essay on the
   topic. Anything that was not in the source goes only into a folded "Dla zrozumienia (AI)" callout.
3. **Cite exactly.** Every anchor (`^tNNNN`, `^pNNNN`) is copied from its line in the transcript, never
   computed or guessed. Every quote is verbatim.
4. **Never delete, never edit sources.** Change nothing in `Recordings/` or `Import/`. A note you retire
   moves to `_SYSTEM/merged/`.

## 0. Start
1. Read `_SYSTEM/processing-rules.md`: my standing rules. If it disagrees with this file on a format, this
   file wins (the dashboard reads these formats).
2. If `_SYSTEM/routine.lock` exists and holds a time less than 3 hours ago, another run is going: reply
   "Already running" and stop. Otherwise write the current date and time into it. Delete it when you
   finish, also when you stop early or something fails.

## 1. Pick the work
- Notes in `Sessions/` whose frontmatter has `status: new`, oldest first (by file name). At most 2
  sessions per run: a long lecture is a lot of reading and quality comes first. The rest wait.
- The parts are listed between `<!-- kos:parts -->` and `<!-- /kos:parts -->`. If the frontmatter has
  `processed_parts: [1, 2]`, only the other parts are new (a session reopens when a new part arrives):
  read the processed parts for context and **update** the session's existing summary, never write a
  second one. If every part is already in `processed_parts`, I set `status: new` back by hand because I
  want the session redone: treat all parts as new.
- `source: import` (or `youtube`) in the session note: the transcript comes from a file I downloaded (the
  university's platform, a course, YouTube captions). Its "## Imported with it" list may name:
  - **the institution's summary** (`... (podsumowanie uczelni)`): the platform's own AI summary. Use it only
    to check that you missed nothing important. **The transcript is the truth**: never take a statement
    from the institution's summary that the transcript does not support, and never cite it. If it
    mentions something the transcript lacks, say so under "Do wyjaśnienia".
  - **materials** (`... (materiały)`): slides or handouts. Use them to spell names, terms and formulas
    correctly and to follow the structure. Something that is only on a slide was not "said".
  - "No transcript came with it": the parts are the institution's summary or the materials. Write the
    summary from them all the same, and say under "Do wyjaśnienia" that there was no transcript.
- Nothing new: do only steps 6 and 7.

## 2. Read
- Read the new parts in order as one text. A transcript line is either `**[hh:mm:ss]** text ^tNNNN`
  (NNNN = the segment's start in seconds) or, for a file without times, `**[¶N]** text ^pNNNN`
  (paragraph N).
- The language is the language the transcript is spoken in: `pl` or `en`. Not the language of the
  institution's summary, not the language of older notes.
- Speech recognition mishears words. Fix obvious mistakes in your own wording (the materials and the
  context help), never inside a quote. A key term that stays unclear goes under "Do wyjaśnienia".
- The course: an existing folder in `Lectures/` when it is the same course (same subject, same lecturer,
  a continuation); else from the session's `original_name`, the file name or what is said ("na
  dzisiejszych zajęciach z logiki"); else `Inne` (pl) / `Other` (en). Short, in the note's language, the
  same spelling every time.
- No knowledge at all (silence, music, a private call): set `status: skipped`, write one line why under
  "## Knowledge", add its parts to `processed_parts`, and move on.

## 3. Write the lecture summary
One file per session: `Lectures/<Course>/<YYYY-MM-DD> <Topic>.md`. The date is the session's (the start of
`started`); the topic is 3-8 words in the note's language. File and folder names use only letters,
digits, spaces, hyphens, commas and parentheses. First search `Lectures/` for a summary whose `sessions`
already lists this session: if there is one, update that file instead of creating another.

The frontmatter, exactly these fields:

    ---
    type: lecture-summary
    course: "Logika"
    topic: "Zdania logiczne i zbiory"
    date: 2026-10-11
    language: pl
    sessions: ["[[Sessions/2026-10-11 13-32]]"]
    source: recording
    ---

- `language`: `pl` or `en`, the language of the whole note.
- `sessions`: every session this summary covers, as quoted links.
- `source`: `recording` when the session note has no `source`; otherwise the session note's `source`
  (`import` or `youtube`).

The body, in this order. Polish headings are shown; an English note uses the English ones in brackets.
1. `## W skrócie` [`## In short`]: 3-5 sentences: what the lecture was about and what to take from it.
2. Numbered topic sections in lecture order: `## 1. <section>`. End each heading with a link to the
   moment it starts: `[[Recordings/<note>#^t0754|12:34]]` (the label is that anchor as m:ss or h:mm:ss) or,
   without times, `[[Recordings/<note>#^p0012|¶12]]`. The body is what was said, compressed but faithful:
   definitions as given, the lecturer's reasoning, examples and formulas. Short paragraphs, lists, a table
   where the lecturer built one. Usually 3-8 sections for an hour.
3. `## Na co prowadzący kładł nacisk` [`## What the lecturer stressed`]: one bullet per point the lecturer
   repeated, called important ("to ważne", "proszę zapamiętać") or tied to the exam or a test ("będzie na
   egzaminie", "na kolokwium"), plus dates and requirements given. Each bullet ends with its anchor link.
   Never drop or merge these: this is what I revise from.
4. `## Do wyjaśnienia` [`## To clarify`]: unclear audio, terms you could not make out, contradictions
   (also with the institution's summary), what I should check. "Brak." [`None.`] when there is nothing.
5. `## Pojęcia` [`## Concepts`]: one `[[link]]` per line to the Knowledge notes of this lecture, only notes
   that exist or that you write in this run.
6. The glossary, last: `> [!note]- Słowniczek PL ↔ EN` [`> [!note]- Glossary EN ↔ PL`], one line per key
   term: `> - **term in the note's language**: term in the other language`. The only place the other
   language appears in a summary.

Callouts use Obsidian's syntax, folded by default (`-` right after the type); every line inside starts
with `> `:
- `> [!example]- Przykład` [`> [!example]- Example`]: an example from the source, worked as it was given.
- `> [!tip]- Dla zrozumienia (AI)` [`> [!tip]- For understanding (AI)`]: the **only** place for anything
  that was not in the source: background, an intuition, a simpler example, a common mistake. At most 2 per
  section; plain, correct and short (2-5 sentences). Never put the lecture's own content here, and never
  put your own additions anywhere else.
- `> [!abstract]- Wizualizacja` [`> [!abstract]- Visualisation`]: one diagram or plot, only when a picture
  explains better than words: the shape of a function, a relation between sets, a process, a hierarchy.
  Most lectures need 0-2 in total.

Math is LaTeX: `$...$` inline, `$$...$$` on lines of its own, standard commands only (it is rendered with
KaTeX).

A visualisation callout holds exactly one of these blocks (inside the callout, so every line starts with
`> `):
- a `mermaid` block (`flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `mindmap`,
  `timeline`); put labels with special characters in quotes: `A["x ∈ A"]`;
- a `plot` block, one JSON object (it may span lines):

      ```plot
      {"title": "sin i cos", "x": [-6.28, 6.28], "y": [-1.5, 1.5],
       "functions": [{"expr": "sin(x)", "label": "sin x"}, {"expr": "cos(x)"}],
       "points": [{"x": 0, "y": 0, "label": "0"}]}
      ```

  `x` is the [min, max] of the horizontal axis, `y` (optional) of the vertical one; `functions` is a list
  of `{"expr": ..., "label": ...}` (label optional); `points` is optional.
- a `plot3d` block, one JSON object **per line**: a surface, points, vectors:

      ```plot3d
      {"title": "Siodło", "kind": "surface", "expr": "x^2 - y^2", "x": [-2, 2], "y": [-2, 2]}
      {"kind": "points", "points": [{"x": 1, "y": 2, "z": 3, "label": "A"}]}
      {"kind": "vectors", "vectors": [{"from": [0,0,0], "to": [1,2,3], "label": "v"}]}
      ```

The JSON is strict: double quotes, no comments, no trailing commas, numbers as numbers. An expression uses
only numbers, `x`, `y`, `pi`, `e`, `+ - * / ^`, parentheses, unary minus and the functions `sin cos tan
asin acos atan sqrt abs exp ln log floor ceil`. Write every multiplication (`2*x`, not `2x`) and powers
with `^` (`x^2`, not `x²`). Titles and labels are in the note's language.

## 4. Atomic notes in Knowledge/
The summary is what I read; atomic notes are what links lectures together. Write few, good ones.
- **Limit:** at most 15 new notes per hour of real lecture and at most 5 for a source under 15 minutes.
  Without times, count about 150 words as one minute. Small talk, logistics and repetition give none.
- **Search first,** in the whole vault except `Recordings/`, `Import/` and `_SYSTEM/`: titles, `aliases`
  and text, in both languages.
  - Same idea, note in the same language: extend it. Add the source to `sources`, add the quote, add one
    line on what this lecture adds. Change its statement only if it was wrong, and say so.
  - Same idea, note in the other language: do not mix languages inside it. Write the note in this language,
    with the other note's term in `aliases`, and link the two.
  - Similar but different: a new note; link both ways, saying how they differ.
  - In conflict with a note: a `contradiction` note linking both sides, each with its quote. Do not decide
    who is right.
  - My own notes elsewhere in the vault: link to them, never edit them.
- Older notes may have English titles for Polish lectures: leave them as they are and do not rename them
  (links point at them).

One file per note, exactly in this shape (for an English lecture, the same with English words):

    ---
    type: definition
    course: "Logika"
    aliases: ["proposition"]
    sources: ["[[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t0754]]"]
    confidence: high
    created: 2026-10-11
    ---
    # Zdanie logiczne

    Jedno do czterech zdań własnymi słowami, w języku źródła.

    > "Zdanie logiczne to zdanie oznajmujące, o którym możemy powiedzieć, czy jest prawdziwe, czy fałszywe." ([[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t0754]])

    Powiązane: część [[Spójniki logiczne]]; przykład: [[Tabela prawdy]].

- `type` is one of: concept, claim, principle, definition, model, example, observation, question,
  decision, contradiction, assumption. Frontmatter keys and `type` values stay in English: the dashboard
  reads them.
- `aliases`: the term in the other language (and common synonyms). `course`: as in the summary.
- The file name is the title, in the note's language: short, unique, only letters, digits, spaces,
  hyphens, commas, apostrophes and parentheses.
- No quote, no note: every note quotes the transcript verbatim with its anchor link. Uncertainty stays
  ("chyba", "maybe" -> `confidence: low`, and say so).
- `sources` is a list of quoted strings; the frontmatter must stay valid YAML.
- The last line names the relation in the note's language: `Powiązane:` (wspiera, doprecyzowuje,
  przeczy, przykład, część, zależy od) / `Related:` (supports, refines, contradicts, example of, part of,
  depends on).
- When 3 or more notes share a concept, keep a `concept` hub note linking them, one line each on how it
  relates (a map, not merged text).
- Never write a `[[link]]` to a note that does not exist and that you are not writing in this run.

## 5. Update the session note
- Under "## Knowledge", one line per file: `- [[Lectures/<Course>/<YYYY-MM-DD> <Topic>]] (summary)`, then
  `- [[Note]] (new)` or `- [[Note]] (extended)`.
- In the frontmatter: `topic: <3-8 words, the note's language>`, `course: "<Course>"`,
  `summary: "[[Lectures/<Course>/<YYYY-MM-DD> <Topic>]]"`, `processed_parts: [<every part done>]`.
- A session that continues an earlier one (same course, same topic picked up again) also gets
  `continues: "[[Sessions/<earlier session>]]"`.
- Set `status: processed` last, after every other file is written, so a run that stops halfway is redone
  next time, not lost (search first and you will update, not duplicate).
- Never change the `<!-- kos:parts -->` block, the "## Imported with it" list or anything in `Recordings/`.

## 6. Gardening (every run, keep it short)
Only notes created or changed in the last 7 days:
- add missing links between them (same concept, cause and effect, example of, part of);
- a duplicate made by mistake (truly the same idea, not just similar): merge into one note keeping every
  source and quote, point links at the kept note, and move the other file to `_SYSTEM/merged/` with one
  line `Merged into [[Kept note]]`. Never delete files;
- an open `question` that a newer lecture answers: link the answer and add `answered_by: "[[Answer note]]"`
  to the question's frontmatter.
Older summaries in `Sessions/Summary *.md` stay where they are.

## 7. Check, log, reply
Check every file you wrote or changed, and fix what fails:
- the frontmatter parses as YAML and has every field above;
- every `^tNNNN` / `^pNNNN` you cite exists in that transcript file, and every quote is verbatim;
- every `[[link]]` points to a note that exists;
- each `plot` block is one valid JSON object, each line of a `plot3d` block is one, and expressions use
  only the allowed names; each mermaid block is valid;
- every callout is folded (`-`), and your own additions are only in "Dla zrozumienia (AI)" / "For
  understanding (AI)";
- each note is in one language (the glossary and `aliases` apart);
- nothing in `Recordings/` or `Import/` changed and nothing was deleted.

Then `_SYSTEM/routine-log.md` (create it if it is missing; never remove lines from it):
- every run, also one with nothing to do: set `last_run: YYYY-MM-DD HH:MM` (local time) in its frontmatter;
  add the frontmatter at the very top if the file has none;
- a run that processed or skipped a session, or hit a problem: append one entry at the end, exactly:

      ## 2026-10-11 15:05
      - sessions: 2026-10-11 13-32 (Logika: Zdania logiczne i zbiory)
      - summaries: 1 new, 0 updated
      - notes: 6 new, 2 extended
      - problems: none

  `problems:` names anything that went wrong or that you were unsure about, else `none`.

Reply briefly: the sessions (course: topic), the summaries and notes written, contradictions found, and
anything you were unsure about. Finally delete `_SYSTEM/routine.lock`.

## Worked example: a complete summary of a Polish lecture
The file `Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md`, written from the session
`Sessions/2026-10-11 13-32.md` with one part, `Recordings/2026-10-11 13-32-05 Logika wykład 2.md`:

````markdown
---
type: lecture-summary
course: "Logika"
topic: "Zdania logiczne i zbiory"
date: 2026-10-11
language: pl
sessions: ["[[Sessions/2026-10-11 13-32]]"]
source: recording
---
## W skrócie
Wykład wprowadził zdanie logiczne i pięć spójników, z których buduje się zdania złożone. Prowadzący omówił tabele prawdy, najdłużej implikację. Potem przeszedł do zbiorów i pokazał, że działania na zbiorach odpowiadają spójnikom. Na koniec omówił funkcję zdaniową i jej zbiór spełnienia.

## 1. Zdanie logiczne [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t0754|12:34]]
Zdanie logiczne to zdanie oznajmujące, o którym można jednoznacznie powiedzieć, czy jest prawdziwe, czy fałszywe. Prawdzie przypisujemy wartość $1$, fałszowi $0$.
Pytania, polecenia i wyrażenia ze zmienną, takie jak $x > 3$, zdaniami logicznymi nie są.

> [!example]- Przykład
> „Warszawa jest stolicą Polski” to zdanie prawdziwe, „$2 + 2 = 5$” to zdanie fałszywe, a „Zamknij okno” w ogóle nie jest zdaniem logicznym.

## 2. Spójniki i tabele prawdy [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t1310|21:50]]
Pięć spójników: negacja $\neg p$, koniunkcja $p \land q$, alternatywa $p \lor q$, implikacja $p \Rightarrow q$ i równoważność $p \Leftrightarrow q$. Wartość zdania złożonego zależy tylko od wartości zdań, z których je zbudowano.

| $p$ | $q$ | $p \land q$ | $p \lor q$ | $p \Rightarrow q$ | $p \Leftrightarrow q$ |
|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 |
| 1 | 0 | 0 | 1 | 0 | 0 |
| 0 | 1 | 0 | 1 | 1 | 0 |
| 0 | 0 | 0 | 0 | 1 | 1 |

Implikacja jest fałszywa tylko wtedy, gdy z prawdy wynika fałsz. Gdy poprzednik jest fałszywy, cała implikacja jest prawdziwa.

> [!tip]- Dla zrozumienia (AI)
> Implikację można czytać jak obietnicę: „jeśli zdasz egzamin, dostaniesz nagrodę”. Obietnica jest złamana tylko wtedy, gdy egzamin zdasz, a nagrody nie dostaniesz. Jeśli egzaminu nie zdasz, obietnica nie została złamana, cokolwiek się stanie.

## 3. Zbiory i działania na zbiorach [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t2655|44:15]]
Zbiór jest pojęciem pierwotnym: nie definiujemy go, tylko wskazujemy jego elementy. Zapis $x \in A$ czytamy „$x$ należy do $A$”.
- suma: $A \cup B = \{x : x \in A \lor x \in B\}$,
- iloczyn (część wspólna): $A \cap B = \{x : x \in A \land x \in B\}$,
- różnica: $A \setminus B = \{x : x \in A \land x \notin B\}$.

Każde działanie odpowiada spójnikowi: suma alternatywie, iloczyn koniunkcji. Jako przykład zawierania zbiorów prowadzący podał $\mathbb{N} \subset \mathbb{Z} \subset \mathbb{Q} \subset \mathbb{R}$.

> [!abstract]- Wizualizacja
> ```mermaid
> flowchart LR
>   N["ℕ: liczby naturalne"] --> Z["ℤ: liczby całkowite"] --> Q["ℚ: liczby wymierne"] --> R["ℝ: liczby rzeczywiste"]
> ```

## 4. Funkcja zdaniowa i zbiór spełnienia [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t3920|1:05:20]]
Funkcja zdaniowa to wyrażenie ze zmienną, które staje się zdaniem logicznym po podstawieniu za zmienną konkretnej wartości. Zbiór spełnienia to zbiór tych wartości, dla których powstaje zdanie prawdziwe.
Przykład z wykładu: dla $x^2 < 4$ w liczbach rzeczywistych zbiorem spełnienia jest przedział $(-2, 2)$.

> [!abstract]- Wizualizacja
> ```plot
> {"title": "x^2 < 4", "x": [-3, 3], "y": [-1, 6],
>  "functions": [{"expr": "x^2", "label": "y = x^2"}, {"expr": "4", "label": "y = 4"}],
>  "points": [{"x": -2, "y": 4, "label": "-2"}, {"x": 2, "y": 4, "label": "2"}]}
> ```

> [!tip]- Dla zrozumienia (AI)
> Na wykresie zbiór spełnienia to te $x$, dla których parabola leży poniżej prostej $y = 4$. Końce $-2$ i $2$ do niego nie należą, bo nierówność jest ostra.

## Na co prowadzący kładł nacisk
- Implikacja z fałszywym poprzednikiem jest zawsze prawdziwa: powtórzył to trzy razy i zapowiedział takie zadanie na kolokwium. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t1580|26:20]]
- Tabele prawdy wszystkich pięciu spójników trzeba umieć napisać z pamięci. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t1702|28:22]]
- „To jest ważne”: działania na zbiorach zapisujemy przez spójniki, a nie samym rysunkiem. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t3012|50:12]]
- Kolokwium z rozdziałów 1-2 będzie na zjeździe 8 listopada. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t5410|1:30:10]]

## Do wyjaśnienia
- Około 52:40 nagranie jest niewyraźne; chyba chodzi o różnicę symetryczną zbiorów. Warto sprawdzić w materiałach. [[Recordings/2026-10-11 13-32-05 Logika wykład 2#^t3160|52:40]]

## Pojęcia
- [[Zdanie logiczne]]
- [[Implikacja]]
- [[Działania na zbiorach]]
- [[Funkcja zdaniowa]]

> [!note]- Słowniczek PL ↔ EN
> - **zdanie logiczne**: proposition
> - **koniunkcja**: conjunction
> - **alternatywa**: disjunction
> - **implikacja**: implication
> - **równoważność**: equivalence
> - **zbiór**: set
> - **suma zbiorów**: union
> - **iloczyn zbiorów**: intersection
> - **funkcja zdaniowa**: propositional function
> - **zbiór spełnienia**: solution set
````
