/**
 * Realistic vault content for the Wykłady tests: a Polish logic lecture in
 * format 2 (LaTeX, folded callouts, a table, mermaid, plot and plot3d), a
 * second one with the lecture map and "Do zapamiętania", the course's
 * textbook, an English data-science course imported from a text file
 * (paragraph anchors), a legacy Sessions/Summary note, knowledge notes,
 * session notes, the routine's log and the recordings with their transcripts.
 */
import type { RecordingRow, Segment, VaultFile } from "../lib/kos-vault";

export const VAULT = "Studia";
export const REC_PL = "2026-10-11 13-32-05 Logika wykład 2";
export const REC_EN = "2026-10-12 09-00-00 Intro to Data Science week 3";
export const REC_OLD = "2026-10-13 15-53-52 bandicam 2026-10-13 15-53-52-852";
export const REC_PL2 = "2026-10-18 13-30-10 Logika wykład 3";

const at = (s: number) => `[[Recordings/${REC_PL}#^t${String(s).padStart(4, "0")}|${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}]]`;
const atH = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `[[Recordings/${REC_PL}#^t${String(s).padStart(4, "0")}|${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}]]`;
};
const at2 = (s: number) => `[[Recordings/${REC_PL2}#^t${String(s).padStart(4, "0")}|${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}]]`;
const para = (n: number) => `[[Recordings/${REC_EN}#^p${String(n).padStart(4, "0")}|¶${n}]]`;

export const LECTURE_PL = `---
type: lecture-summary
course: "Logika"
topic: "Zdania logiczne i zbiory"
date: 2026-10-11
language: pl
sessions: ["[[Sessions/2026-10-11 13-32]]"]
source: recording
---
## W skrócie
Wykład wprowadził **zdanie logiczne** i pięć spójników, z których buduje się zdania złożone. Prowadzący omówił tabele prawdy, najdłużej implikację $p \\Rightarrow q$. Potem przeszedł do zbiorów i pokazał, że działania na zbiorach odpowiadają spójnikom. Na koniec omówił funkcję zdaniową i jej zbiór spełnienia.

## 1. Zdanie logiczne ${at(754)}
Zdanie logiczne to zdanie oznajmujące, o którym można jednoznacznie powiedzieć, czy jest prawdziwe, czy fałszywe. Prawdzie przypisujemy wartość $1$, fałszowi $0$.
Pytania, polecenia i wyrażenia ze zmienną, takie jak $x > 3$, zdaniami logicznymi nie są.

> [!example]- Przykład
> „Warszawa jest stolicą Polski” to zdanie prawdziwe, „$2 + 2 = 5$” to zdanie fałszywe, a „Zamknij okno” w ogóle nie jest zdaniem logicznym.

## 2. Spójniki i tabele prawdy ${at(1310)}
Pięć spójników: negacja $\\neg p$, koniunkcja $p \\land q$, alternatywa $p \\lor q$, implikacja $p \\Rightarrow q$ i równoważność $p \\Leftrightarrow q$. Wartość zdania złożonego zależy tylko od wartości zdań, z których je zbudowano (zob. [[Implikacja]]).

| $p$ | $q$ | $p \\land q$ | $p \\lor q$ | $p \\Rightarrow q$ | $p \\Leftrightarrow q$ |
|---|---|:---:|:---:|:---:|:---:|
| 1 | 1 | 1 | 1 | 1 | 1 |
| 1 | 0 | 0 | 1 | 0 | 0 |
| 0 | 1 | 0 | 1 | 1 | 0 |
| 0 | 0 | 0 | 0 | 1 | 1 |

Implikacja jest fałszywa tylko wtedy, gdy z prawdy wynika fałsz:

$$
(p \\Rightarrow q) \\iff (\\neg p \\lor q)
$$

> [!tip]- Dla zrozumienia (AI)
> Implikację można czytać jak obietnicę: „jeśli zdasz egzamin, dostaniesz nagrodę”. Obietnica jest złamana tylko wtedy, gdy egzamin zdasz, a nagrody nie dostaniesz.

## 3. Zbiory i działania na zbiorach ${at(2655)}
Zbiór jest pojęciem pierwotnym: nie definiujemy go, tylko wskazujemy jego elementy. Zapis $x \\in A$ czytamy „$x$ należy do $A$”.
- suma: $A \\cup B = \\{x : x \\in A \\lor x \\in B\\}$,
- iloczyn (część wspólna): $A \\cap B = \\{x : x \\in A \\land x \\in B\\}$,
  - iloczyn zbiorów rozłącznych jest pusty: $A \\cap B = \\emptyset$,
- różnica: $A \\setminus B = \\{x : x \\in A \\land x \\notin B\\}$.

Każde działanie odpowiada spójnikowi: suma alternatywie, iloczyn koniunkcji. Jako przykład zawierania zbiorów prowadzący podał $\\mathbb{N} \\subset \\mathbb{Z} \\subset \\mathbb{Q} \\subset \\mathbb{R}$.

> [!abstract]- Wizualizacja
> \`\`\`mermaid
> flowchart LR
>   N["ℕ: liczby naturalne"] --> Z["ℤ: liczby całkowite"] --> Q["ℚ: liczby wymierne"] --> R["ℝ: liczby rzeczywiste"]
> \`\`\`

## 4. Funkcja zdaniowa i zbiór spełnienia ${atH(3920)}
Funkcja zdaniowa to wyrażenie ze zmienną, które staje się zdaniem logicznym po podstawieniu za zmienną konkretnej wartości. Zbiór spełnienia to zbiór tych wartości, dla których powstaje zdanie prawdziwe.
Przykład z wykładu: dla $x^2 < 4$ w liczbach rzeczywistych zbiorem spełnienia jest przedział $(-2, 2)$.

> [!abstract]- Wizualizacja
> \`\`\`plot
> {"title": "x^2 < 4", "x": [-3, 3], "y": [-1, 6],
>  "functions": [{"expr": "x^2", "label": "y = x^2"}, {"expr": "4", "label": "y = 4"}],
>  "points": [{"x": -2, "y": 4, "label": "-2"}, {"x": 2, "y": 4, "label": "2"}]}
> \`\`\`

Prowadzący pokazał też funkcję dwóch zmiennych $z = x^2 - y^2$ (siodło): punkt $(0, 0)$ nie jest ani maksimum, ani minimum.

> [!abstract]+ Wizualizacja 3D
> \`\`\`plot3d
> {"title": "Siodło", "kind": "surface", "expr": "x^2 - y^2", "x": [-2, 2], "y": [-2, 2]}
> {"kind": "points", "points": [{"x": 0, "y": 0, "z": 0, "label": "punkt siodłowy"}]}
> {"kind": "vectors", "vectors": [{"from": [0,0,0], "to": [1.5,0,2.25], "label": "w górę wzdłuż x"}]}
> \`\`\`

> [!tip]- Dla zrozumienia (AI)
> Na wykresie zbiór spełnienia to te $x$, dla których parabola leży poniżej prostej $y = 4$. Końce $-2$ i $2$ do niego nie należą, bo nierówność jest ostra.

## Na co prowadzący kładł nacisk
- Implikacja z fałszywym poprzednikiem jest zawsze prawdziwa: powtórzył to trzy razy i zapowiedział takie zadanie na kolokwium. ${at(1580)}
- Tabele prawdy wszystkich pięciu spójników trzeba umieć napisać z pamięci. ${at(1702)}
- „To jest ważne”: działania na zbiorach zapisujemy przez spójniki, a nie samym rysunkiem. ${at(3012)}
- Kolokwium z rozdziałów 1-2 będzie na zjeździe 8 listopada. ${atH(5410)}

## Do wyjaśnienia
- Około 52:40 nagranie jest niewyraźne; chyba chodzi o różnicę symetryczną zbiorów. ${at(3160)}

## Pojęcia
- [[Zdanie logiczne]]
- [[Implikacja]]
- [[Działania na zbiorach]]
- [[Funkcja zdaniowa]]

> [!note]- Słowniczek PL ↔ EN
> - **zdanie logiczne**: proposition
> - **implikacja**: implication
> - **zbiór**: set
> - **zbiór spełnienia**: solution set
`;

/** Format 2 with the lecture map first and the "Do zapamiętania" callout (routine prompt, round 2). */
export const LECTURE_PL2 = `---
type: lecture-summary
course: "Logika"
topic: "Kwantyfikatory"
date: 2026-10-18
language: pl
sessions: ["[[Sessions/2026-10-18 13-30]]"]
source: recording
---
## W skrócie
Wykład wprowadził kwantyfikatory: ogólny $\\forall$ i szczegółowy $\\exists$. Prowadzący pokazał, jak z funkcji zdaniowej powstaje zdanie, i jak zaprzecza się zdaniom z kwantyfikatorem.

## Mapa wykładu
\`\`\`mermaid
flowchart LR
  FZ["Funkcja zdaniowa"] -->|"dla każdego x"| KO["Kwantyfikator ogólny ∀"]
  FZ -->|"istnieje x"| KS["Kwantyfikator szczegółowy ∃"]
  KO --> Z["Zdanie logiczne"]
  KS --> Z
  KO <-->|"negacja"| KS
\`\`\`
Kwantyfikator zamienia funkcję zdaniową w zdanie. Negacja zamienia jeden kwantyfikator w drugi.

## 1. Kwantyfikator ogólny ${at2(240)}
Zapis $\\forall_{x \\in X}\\, \\varphi(x)$ czytamy „dla każdego $x$ ze zbioru $X$ zachodzi $\\varphi(x)$”. Zdanie jest prawdziwe, gdy zbiór spełnienia to cały zbiór $X$.

## 2. Kwantyfikator szczegółowy ${at2(1260)}
Zapis $\\exists_{x \\in X}\\, \\varphi(x)$: istnieje co najmniej jeden $x$, dla którego $\\varphi(x)$ jest prawdziwe.

> [!abstract]- Wizualizacja
> \`\`\`plot
> {"title": "x^2 - 1 > 0", "x": [-3, 3], "functions": [{"expr": "x^2 - 1", "label": "y = x^2 - 1"}]}
> \`\`\`

## 3. Negacja zdań z kwantyfikatorem ${at2(2400)}
$\\neg \\forall_x\\, \\varphi(x) \\iff \\exists_x\\, \\neg \\varphi(x)$ oraz $\\neg \\exists_x\\, \\varphi(x) \\iff \\forall_x\\, \\neg \\varphi(x)$.

> [!tip]- Dla zrozumienia (AI)
> Żeby obalić „każdy”, wystarczy jeden kontrprzykład.

## Na co prowadzący kładł nacisk
- Prawa De Morgana dla kwantyfikatorów będą na kolokwium. ${at2(2460)}
- Kolejność różnych kwantyfikatorów ma znaczenie. ${at2(3000)}

## Do wyjaśnienia
- Brak.

## Pojęcia
- [[Kwantyfikator]]
- [[Funkcja zdaniowa]]

> [!important]- Do zapamiętania
> - Symbole: $\\forall$ (dla każdego), $\\exists$ (istnieje).
> - $\\neg \\forall_x\\, \\varphi(x) \\iff \\exists_x\\, \\neg \\varphi(x)$ (prawo De Morgana dla kwantyfikatorów).

> [!note]- Słowniczek PL ↔ EN
> - **kwantyfikator ogólny**: universal quantifier
> - **kwantyfikator szczegółowy**: existential quantifier
> - **zdanie logiczne**: statement
`;

/** The course's textbook, as the routine writes it (type: course-textbook). */
export const TEXTBOOK_PL = `---
type: course-textbook
course: "Logika"
language: pl
updated: 2026-10-19
summaries: ["[[Lectures/Logika/2026-10-11 Zdania logiczne i zbiory]]", "[[Lectures/Logika/2026-10-18 Kwantyfikatory]]"]
---
## W skrócie
Logika buduje zdania złożone ze zdań prostych przez spójniki, a kwantyfikatory zamieniają funkcje zdaniowe w zdania. Działania na zbiorach to te same spójniki zastosowane do elementów.

## Mapa przedmiotu
\`\`\`mermaid
flowchart TD
  ZL["Zdanie logiczne"] --> SP["Spójniki"]
  SP --> TP["Tabele prawdy"]
  SP --> ZB["Działania na zbiorach"]
  FZ["Funkcja zdaniowa"] --> KW["Kwantyfikatory"]
  KW --> ZL
\`\`\`
Zdania i spójniki to pierwszy wykład ([[Lectures/Logika/2026-10-11 Zdania logiczne i zbiory|2026-10-11]]), kwantyfikatory drugi ([[Lectures/Logika/2026-10-18 Kwantyfikatory|2026-10-18]]).

## Mechanizmy
### 1. Wartość zdania złożonego zależy tylko od wartości składników
Wejście: wartości $p$ i $q$. Wyjście: wartość $p \\Rightarrow q$ z tabeli prawdy.

> [!example]- Przykład
> Implikacja z fałszywym poprzednikiem jest prawdziwa.

## Ograniczenia
Zdanie ma dokładnie jedną z dwóch wartości: 1 albo 0.

## Co zapamiętać, a co wyprowadzić
### Wynika z modelu
- Działania na zbiorach z tabel prawdy.
### Do zapamiętania
- Symbole $\\forall$, $\\exists$, $\\Rightarrow$.

## Cały przedmiot na jednej stronie
Spójniki działają na wartościach, kwantyfikatory na funkcjach zdaniowych, zbiory na elementach.

## Pytania sprawdzające
1. Co się stanie z wartością $p \\Rightarrow q$, gdy $p$ jest fałszywe?
2. Jak zaprzeczyć zdaniu „każdy student zdał”?
`;

export const LECTURE_EN = `---
type: lecture-summary
course: "Intro to Data Science"
topic: "Measuring spread: variance and standard deviation"
date: 2026-10-12
language: en
sessions: ["[[Sessions/2026-10-12 09-00]]"]
source: import
---
## In short
The third week covers how to measure the spread of data. The lecturer defines the variance and the standard deviation, shows why the mean alone can mislead, and introduces the normal distribution with the 68-95-99.7 rule.

## 1. Why the mean is not enough ${para(3)}
Two data sets can share the mean $\\bar{x}$ and still look nothing alike. The lecturer's example: daily temperatures in two cities with the same yearly mean.

> [!example]- Example
> City A: 18, 19, 20, 21, 22. City B: 5, 12, 20, 28, 35. Both have $\\bar{x} = 20$.

## 2. Variance and standard deviation ${para(6)}
The sample variance is the average squared distance from the mean:

$$
s^2 = \\frac{1}{n-1} \\sum_{i=1}^{n} (x_i - \\bar{x})^2
$$

The standard deviation $s = \\sqrt{s^2}$ is in the same units as the data, which is why it is the one reported.

> [!tip]- For understanding (AI)
> Dividing by $n - 1$ instead of $n$ corrects for the sample mean sitting closer to the data than the true mean does.

## 3. The normal distribution ${para(9)}
Many measurements follow a bell curve. About 68% of values lie within one standard deviation of the mean, 95% within two and 99.7% within three.

> [!abstract]- Visualisation
> \`\`\`plot
> {"title": "Standard normal density", "x": [-4, 4],
>  "functions": [{"expr": "exp(-x^2/2)/sqrt(2*pi)", "label": "N(0, 1)"}],
>  "points": [{"x": -1, "y": 0.242, "label": "-1σ"}, {"x": 1, "y": 0.242, "label": "+1σ"}]}
> \`\`\`

> [!abstract]- Visualisation
> \`\`\`mermaid
> flowchart TD
>   A[Collect data] --> B[Mean] --> C[Variance] --> D[Standard deviation]
> \`\`\`

## What the lecturer stressed
- Always report the spread together with the mean. ${para(4)}
- The 68-95-99.7 rule will be on the quiz. ${para(10)}

## To clarify
None.

## Concepts
- [[Standard deviation]]
- [[Data science process steps]]

> [!note]- Glossary EN ↔ PL
> - **variance**: wariancja
> - **standard deviation**: odchylenie standardowe
`;

export const LEGACY = `---
type: lecture-summary
session: "[[Sessions/2026-10-13 15-53]]"
topic: Defining data science and the cloud
created: 2026-10-13
---

# Summary 2026-10-13 15-53

The recording is about 3 hours long, and only a part of it is lecture. It covers what data science is, how a project runs and the cloud service models.

**The process.** A project starts by clarifying the question the organization wants answered ([[Data science process steps]]). The result has to be told as a story ([[Storytelling communicates findings]]).

**Cloud computing.** The lecture defines the three service models (IaaS, PaaS, SaaS) and the deployment models.

Skipped: music and personal conversation.
`;

const file = (path: string, content: string, modified_at = "2026-10-14T10:00:00Z"): VaultFile => ({ path, vault: VAULT, content, modified_at });

const note = (title: string, type: string, body: string, extra = "") =>
  file(`Knowledge/${title}.md`, `---\ntype: ${type}\n${extra}confidence: high\ncreated: 2026-10-11\n---\n# ${title}\n\n${body}\n`);

export const FIXTURE_FILES: VaultFile[] = [
  file("Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md", LECTURE_PL),
  file("Lectures/Logika/2026-10-18 Kwantyfikatory.md", LECTURE_PL2, "2026-10-18T16:00:00Z"),
  file("Lectures/Logika/_Podręcznik.md", TEXTBOOK_PL, "2026-10-19T06:00:00Z"),
  file("Lectures/Intro to Data Science/2026-10-12 Measuring spread.md", LECTURE_EN),
  file("Sessions/Summary 2026-10-13 15-53.md", LEGACY),
  note(
    "Zdanie logiczne",
    "definition",
    `Zdanie oznajmujące, któremu można przypisać prawdę albo fałsz.\n\n> "Zdanie logiczne to zdanie oznajmujące, o którym możemy powiedzieć, czy jest prawdziwe, czy fałszywe." ([[Recordings/${REC_PL}#^t0754]])\n\nPowiązane: część [[Implikacja]].`,
    `course: "Logika"\naliases: ["proposition"]\nsources: ["[[Recordings/${REC_PL}#^t0754]]"]\n`,
  ),
  note(
    "Implikacja",
    "definition",
    `Implikacja $p \\Rightarrow q$ jest fałszywa tylko wtedy, gdy poprzednik jest prawdziwy, a następnik fałszywy.\n\n> "Z fałszu wynika wszystko, proszę to zapamiętać." ([[Recordings/${REC_PL}#^t1580]])`,
    `course: "Logika"\naliases: ["implication", "conditional"]\nsources: ["[[Recordings/${REC_PL}#^t1580]]"]\n`,
  ),
  note("Kwantyfikator", "definition", "Wyrażenie, które z funkcji zdaniowej robi zdanie: „dla każdego” albo „istnieje”.", `course: "Logika"\naliases: ["quantifier"]\nsources: ["[[Recordings/${REC_PL2}#^t0240]]"]\n`),
  note("Działania na zbiorach", "concept", "Suma, iloczyn i różnica zbiorów odpowiadają spójnikom.", `course: "Logika"\naliases: ["set operations"]\n`),
  note("Funkcja zdaniowa", "definition", "Wyrażenie ze zmienną, które po podstawieniu staje się zdaniem.", `course: "Logika"\naliases: ["propositional function"]\n`),
  note(
    "Standard deviation",
    "definition",
    `The square root of the variance, in the units of the data.\n\n> "Always give the spread with the mean." ([[Recordings/${REC_EN}#^p0004]])`,
    `course: "Intro to Data Science"\naliases: ["odchylenie standardowe"]\nsources: ["[[Recordings/${REC_EN}#^p0004]]"]\n`,
  ),
  note("Data science process steps", "model", "Clarify the problem, collect data, analyse, find patterns, tell the story.", `sources: ["[[Recordings/${REC_OLD}#^t2140]]"]\n`),
  note("Storytelling communicates findings", "principle", "Findings that are not told as a story stay buried.", `sources: ["[[Recordings/${REC_OLD}#^t2500]]"]\n`),
  file(
    "Sessions/2026-10-11 13-32.md",
    `---\ntype: session\nstatus: processed\nstarted: 2026-10-11 13-32\nparts: 1\nprocessed_parts: [1]\ntopic: Zdania logiczne i zbiory\ncourse: "Logika"\nsummary: "[[Lectures/Logika/2026-10-11 Zdania logiczne i zbiory]]"\n---\n# Session 2026-10-11 13-32\n\n## Recordings\n<!-- kos:parts -->\n- Part 1: [[Recordings/${REC_PL}]]\n<!-- /kos:parts -->\n\n## Knowledge\n- [[Lectures/Logika/2026-10-11 Zdania logiczne i zbiory]] (summary)\n- [[Zdanie logiczne]] (new)\n- [[Implikacja]] (new)\n`,
  ),
  file(
    "Sessions/2026-10-12 09-00.md",
    `---\ntype: session\nstatus: processed\nstarted: 2026-10-12 09-00\nsource: import\nparts: 1\ntopic: Measuring spread\n---\n# Session 2026-10-12 09-00\n\n## Knowledge\n- [[Standard deviation]] (new)\n`,
  ),
  file(
    "Sessions/2026-10-13 15-53.md",
    `---\ntype: session\nstatus: processed\nstarted: 2026-10-13 15-53\nparts: 1\ntopic: Defining data science and the cloud\n---\n# Session 2026-10-13 15-53\n\n## Knowledge\n- [[Data science process steps]] (new)\n`,
  ),
  file(
    "Sessions/2026-10-18 13-30.md",
    `---\ntype: session\nstatus: processed\nstarted: 2026-10-18 13-30\nparts: 1\ntopic: Kwantyfikatory\ncourse: "Logika"\nsummary: "[[Lectures/Logika/2026-10-18 Kwantyfikatory]]"\n---\n# Session 2026-10-18 13-30\n\n## Knowledge\n- [[Kwantyfikator]] (new)\n`,
    "2026-10-18T16:00:00Z",
  ),
  file(
    "Sessions/2026-10-14 08-10.md",
    `---\ntype: session\nstatus: new\nstarted: 2026-10-14 08-10\nparts: 1\n---\n# Session 2026-10-14 08-10\n`,
    "2026-10-14T06:12:00Z",
  ),
  file(
    "_SYSTEM/routine-log.md",
    `---\nlast_run: 2026-10-15 07:05\n---\n# Routine log\n\n> [!info] Tracker 1.3.0, 2026-10-15 06:58: nowy format rutyny.\n\n## 2026-10-12 23:40\n- sessions: 2026-10-11 13-32 (Logika: Zdania logiczne i zbiory)\n- summaries: 1 new, 0 updated\n- notes: 4 new, 0 extended\n- problems: none\n\n## 2026-10-13 23:47\n- sessions: 2026-10-12 09-00 (Intro to Data Science: Measuring spread)\n- summaries: 1 new, 0 updated\n- notes: 1 new, 1 extended\n- problems: ¶7 of the import was cut off mid-sentence\n`,
  ),
];

const row = (id: string, note_name: string, recorded_at: string, session_key: string, extra: Partial<RecordingRow> = {}): RecordingRow => ({
  id,
  file_name: `${note_name}.mp3`,
  note_name,
  recorded_at,
  duration_seconds: 5600,
  session_key,
  part: 1,
  language: "pl",
  model: "large-v3",
  source: "recording",
  original_name: null,
  ...extra,
});

export const FIXTURE_RECORDINGS: RecordingRow[] = [
  row("rec-pl", REC_PL, "2026-10-11T11:32:05Z", "2026-10-11 13-32"),
  row("rec-en", REC_EN, "2026-10-12T07:00:00Z", "2026-10-12 09-00", {
    duration_seconds: 0,
    language: "en",
    model: "import",
    source: "import",
    original_name: "Week 3 - Measuring spread (transcript).txt",
    file_name: "Week 3 - Measuring spread (transcript).txt",
  }),
  row("rec-old", REC_OLD, "2026-10-13T13:53:52Z", "2026-10-13 15-53", { language: "en", duration_seconds: 14100 }),
  row("rec-new", "2026-10-14 08-10-00 bandicam", "2026-10-14T06:10:00Z", "2026-10-14 08-10", { duration_seconds: 1200 }),
  row("rec-pl2", REC_PL2, "2026-10-18T11:30:10Z", "2026-10-18 13-30", { duration_seconds: 4800 }),
];

const PL_LINES = [
  "Dzień dobry państwu, zaczynamy drugi wykład z logiki.",
  "Dzisiaj zdania logiczne, spójniki, a potem zbiory.",
  "Zdanie logiczne to zdanie oznajmujące, o którym możemy powiedzieć, czy jest prawdziwe, czy fałszywe.",
  "Prawdzie przypisujemy jedynkę, fałszowi zero.",
  "Pytanie albo polecenie nie jest zdaniem logicznym.",
  "Przejdźmy do spójników: negacja, koniunkcja, alternatywa, implikacja, równoważność.",
  "Z fałszu wynika wszystko, proszę to zapamiętać.",
  "Tabele prawdy trzeba znać na pamięć, będą na kolokwium.",
  "Teraz zbiory. Zbiór to pojęcie pierwotne.",
  "To jest ważne: działania na zbiorach zapisujemy przez spójniki.",
  "Różnica symetryczna, hm, wrócimy do tego.",
  "Funkcja zdaniowa to wyrażenie ze zmienną.",
  "Kolokwium z rozdziałów pierwszego i drugiego ósmego listopada.",
];
const PL_STARTS = [0, 300, 754, 790, 820, 1310, 1580, 1702, 2655, 3012, 3160, 3920, 5410];

export const FIXTURE_SEGMENTS: Record<string, Segment[]> = {
  "rec-pl": PL_LINES.map((text, i) => ({ start: PL_STARTS[i], end: (PL_STARTS[i + 1] ?? 5600) - 1, text })),
  "rec-en": [
    "Welcome back to week three.",
    "Today: how spread out is the data?",
    "Two data sets can have the same mean and look nothing alike.",
    "Always report the spread together with the mean.",
    "Here are two cities with the same yearly mean temperature.",
    "The variance is the average squared distance from the mean.",
    "We divide by n minus one for a sample.",
    "The standard deviation is the square root of the variance.",
    "Many measurements follow a bell curve, the normal distribution.",
    "68, 95 and 99.7 percent: this rule will be on the quiz.",
  ].map((text, i) => ({ start: 0, end: 0, text, p: i + 1 })),
  "rec-old": [{ start: 2140, end: 2160, text: "First you clarify the question the business wants answered." }],
  "rec-new": [{ start: 0, end: 4, text: "Test." }],
  "rec-pl2": [
    [0, "Dzień dobry, dzisiaj kwantyfikatory."],
    [240, "Kwantyfikator ogólny: dla każdego x ze zbioru X zachodzi fi od x."],
    [1260, "Kwantyfikator szczegółowy: istnieje co najmniej jeden x."],
    [2400, "Negacja: zaprzeczenie zdania z dla każdego to istnieje x, dla którego nie."],
    [2460, "Prawa De Morgana dla kwantyfikatorów będą na kolokwium, proszę to umieć."],
    [3000, "Uwaga, kolejność różnych kwantyfikatorów ma znaczenie, nie wolno ich zamieniać."],
  ].map(([start, text], i, all) => ({ start: start as number, end: ((all[i + 1]?.[0] as number) ?? 4800) - 1, text: text as string })),
};
