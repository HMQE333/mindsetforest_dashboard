// Smart dictation post-processing for voice notes (Wispr-Flow-style).
//
// Converts spoken commands ("comma", "dot", "new line") into real punctuation
// and formatting, parses numbers ("one hundred twenty three" -> "123"), maps
// spoken emoji names, and detects editing control words ("pause", "scratch
// that", "clear"). The output is plain text ready to drop into a note.

export type VoiceCommand = "pause" | "undo" | "clear";

export interface VoiceResult {
  /** Formatted text to append to the note ("" when a pure control command). */
  text: string;
  /** A control command to act on, if any. */
  command: VoiceCommand | null;
}

// ---------------------------------------------------------------------------
// Punctuation & symbols (spoken phrase -> written symbol)
// ---------------------------------------------------------------------------
const SYMBOL_MAP: Record<string, string> = {
  // sentence punctuation
  "period": ".", "full stop": ".", "dot": ".",
  "comma": ",",
  "question mark": "?",
  "exclamation mark": "!", "exclamation point": "!", "exclamation": "!",
  "colon": ":",
  "semicolon": ";",
  "ellipsis": "…", "dot dot dot": "…",
  // dashes & typography
  "hyphen": "-", "dash": "-",
  "em dash": "—", "en dash": "–",
  "underscore": "_",
  "apostrophe": "'",
  "open quote": "\"", "close quote": "\"", "single quote": "'",
  "open parenthesis": "(", "open paren": "(", "left parenthesis": "(",
  "close parenthesis": ")", "close paren": ")", "right parenthesis": ")",
  "open bracket": "[", "left bracket": "[",
  "close bracket": "]", "right bracket": "]",
  "open brace": "{", "left brace": "{",
  "close brace": "}", "right brace": "}",
  "open angle bracket": "<", "close angle bracket": ">",
  // operators & symbols
  "slash": "/", "forward slash": "/",
  "backslash": "\\",
  "asterisk": "*",
  "ampersand": "&",
  "percent": "%", "percent sign": "%",
  "hashtag": "#", "number sign": "#", "pound sign": "#",
  "at sign": "@", "at symbol": "@",
  "dollar sign": "$",
  "euro sign": "€",
  "pound sterling": "£",
  "plus sign": "+",
  "minus sign": "-",
  "equals": "=", "equal sign": "=", "equals sign": "=",
  "less than": "<",
  "greater than": ">",
  "tilde": "~",
  "caret": "^",
  "vertical bar": "|",
  "backtick": "`",
  "bullet point": "•",
};

// ---------------------------------------------------------------------------
// Emojis (spoken phrase -> emoji). Phrased to avoid false positives.
// ---------------------------------------------------------------------------
const EMOJI_MAP: Record<string, string> = {
  "smiley face": "🙂",
  "happy face": "😊",
  "laughing face": "😄",
  "sad face": "😢",
  "crying face": "😭",
  "angry face": "😠",
  "wink face": "😉",
  "thinking face": "🤔",
  "shocked face": "😮", "surprised face": "😮",
  "cool face": "😎", "sunglasses face": "😎",
  "heart emoji": "❤️", "love emoji": "❤️",
  "broken heart": "💔",
  "fire emoji": "🔥",
  "thumbs up": "👍",
  "thumbs down": "👎",
  "clapping hands": "👏",
  "praying hands": "🙏",
  "eyes emoji": "👀",
  "rocket emoji": "🚀",
  "check mark": "✅",
  "cross mark": "❌", "x mark": "❌",
  "star emoji": "⭐",
  "sparkles emoji": "✨",
  "party popper": "🎉",
  "brain emoji": "🧠",
  "muscle emoji": "💪",
  "hundred emoji": "💯", "one hundred emoji": "💯",
  "lightbulb": "💡", "idea emoji": "💡",
  "warning emoji": "⚠️", "warning sign": "⚠️",
  "pushpin": "📌", "pin emoji": "📌",
  "note emoji": "📝",
  "calendar emoji": "📅",
  "book emoji": "📚",
  "money face": "🤑", "money emoji": "🤑",
  "clock emoji": "⏰",
  "target emoji": "🎯", "bullseye": "🎯",
  "trophy emoji": "🏆",
  "chart up": "📈", "chart increasing": "📈",
  "chart down": "📉", "chart decreasing": "📉",
  "lightning bolt": "⚡", "zap": "⚡",
  "lock emoji": "🔒",
  "key emoji": "🔑",
  "coffee emoji": "☕",
  "pizza emoji": "🍕",
  "dog emoji": "🐶",
  "cat emoji": "🐱",
  "sun emoji": "☀️",
  "moon emoji": "🌙",
  "skull emoji": "💀",
  "wave emoji": "👋",
  "hourglass": "⏳",
};

// ---------------------------------------------------------------------------
// Structure commands
// ---------------------------------------------------------------------------
const STRUCTURE_MAP: Record<string, string> = {
  "new line": "\n", "next line": "\n", "line break": "\n",
  "new paragraph": "\n\n", "new paragraph break": "\n\n",
};

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------
const DIGIT_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

const SCALE_WORDS: Record<string, number> = {
  hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000,
};

const DECIMAL_SEP_WORDS = new Set(["point", "dot"]);

// ---------------------------------------------------------------------------
// Control commands (exact spoken match)
// ---------------------------------------------------------------------------
const CONTROL_EXACT: Record<string, VoiceCommand> = {
  "pause": "pause", "stop": "pause", "stop listening": "pause",
  "pause dictation": "pause", "end dictation": "pause",
  "scratch that": "undo", "delete that": "undo", "undo": "undo", "undo that": "undo",
  "clear": "clear", "clear all": "clear", "clear everything": "clear",
  "start over": "clear", "erase": "clear",
};

const CONTRACTION_TAILS = new Set(["t", "s", "re", "ll", "ve", "d", "m"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Longest-first so multi-word phrases win over their single-word parts.
const ALL_COMMANDS: [string, string][] = (() => {
  const entries: [string, string][] = [
    ...Object.entries(SYMBOL_MAP),
    ...Object.entries(EMOJI_MAP),
    ...Object.entries(STRUCTURE_MAP),
  ];
  return entries.sort((a, b) => b[0].length - a[0].length);
})();

function wordsToNumber(words: string[]): number {
  let result = 0;
  let current = 0;
  for (const w of words) {
    const lw = w.toLowerCase();
    if (SCALE_WORDS[lw] !== undefined) {
      if (lw === "hundred") {
        current *= 100;
      } else {
        current *= SCALE_WORDS[lw];
        result += current;
        current = 0;
      }
    } else if (DIGIT_WORDS[lw] !== undefined) {
      current += DIGIT_WORDS[lw];
    }
  }
  return result + current;
}

function numberRunToString(run: string[]): string {
  const sepIdx = run.findIndex((w) => DECIMAL_SEP_WORDS.has(w.toLowerCase()));
  if (sepIdx >= 0) {
    const intVal = wordsToNumber(run.slice(0, sepIdx));
    const fracDigits = run
      .slice(sepIdx + 1)
      .map((w) => DIGIT_WORDS[w.toLowerCase()])
      .filter((d): d is number => d !== undefined)
      .join("");
    return fracDigits ? `${intVal}.${fracDigits}` : `${intVal}.`;
  }
  // With scale words (hundred/thousand/million). Full accumulation algorithm.
  const hasScale = run.some((w) => SCALE_WORDS[w.toLowerCase()] !== undefined);
  if (hasScale) return String(wordsToNumber(run));

  // No scale, no decimal. Render individual numbers. Pair a tens word
  // ("twenty") with the following unit ("one") to produce "21".
  const out: string[] = [];
  for (let i = 0; i < run.length; i++) {
    const w = run[i].toLowerCase();
    const d = DIGIT_WORDS[w];
    if (d === undefined) { out.push(run[i]); continue; }
    // tens word (20,30,…,90) followed by a unit (1-9)? → combine
    if (d >= 20 && d % 10 === 0 && i + 1 < run.length) {
      const nd = DIGIT_WORDS[run[i + 1].toLowerCase()];
      if (nd !== undefined && nd >= 1 && nd <= 9) {
        out.push(String(d + nd));
        i++;
        continue;
      }
    }
    out.push(String(d));
  }
  return out.join(" ");
}

function convertNumberRuns(text: string): string {
  return text.replace(/[A-Za-z]+(?:[ \t]+[A-Za-z]+)*/g, (segment) => {
    const words = segment.split(/[ \t]+/).filter(Boolean);
    const out: string[] = [];
    let i = 0;
    while (i < words.length) {
      const run: string[] = [];
      let j = i;
      while (j < words.length) {
        const lw = words[j].toLowerCase();
        if (
          DIGIT_WORDS[lw] !== undefined ||
          SCALE_WORDS[lw] !== undefined ||
          DECIMAL_SEP_WORDS.has(lw)
        ) {
          run.push(words[j]);
          j++;
        } else {
          break;
        }
      }
      if (run.length > 0) {
        const hasDigit = run.some((w) => DIGIT_WORDS[w.toLowerCase()] !== undefined);
        // Require at least 2 tokens to avoid converting lone "one"/"five" etc.
        if (hasDigit && run.length >= 2) {
          out.push(numberRunToString(run));
        } else {
          out.push(...run);
        }
        i = j;
      } else {
        out.push(words[i]);
        i++;
      }
    }
    return out.join(" ");
  });
}

function replaceCommands(text: string): string {
  let out = text;
  for (const [phrase, symbol] of ALL_COMMANDS) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi"), symbol);
  }
  return out;
}

function cleanSpacing(text: string): string {
  let t = text;
  // contractions: "don ' t" -> "don't"
  t = t.replace(/([A-Za-z])[ \t]+'[ \t]+([A-Za-z]+)/g, (m, a, b) =>
    CONTRACTION_TAILS.has(String(b).toLowerCase()) ? `${a}'${b}` : m,
  );
  // no space before trailing punctuation
  t = t.replace(/[ \t]+([.,?!:;…)\]}"”’])/g, "$1");
  // no space after opening punctuation
  t = t.replace(/([([{“‘"])[ \t]+/g, "$1");
  // newline spacing
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  // collapse horizontal whitespace (but preserve newlines)
  t = t.replace(/[ \t]+/g, " ");
  // trim leading/trailing spaces/tabs only. Keep intentional newlines
  return t.replace(/^[ \t]+|[ \t]+$/g, "");
}

// Symbols that should NOT trigger capitalization (everything except letters,
// digits, and sentence-enders).
const NON_CAP_BEFORE = /[^A-Za-z0-9.?!\n]/;

function smartCapitalize(text: string, capitalizeFirst: boolean): string {
  let out = "";
  let cap = capitalizeFirst;
  let lastNonSpace = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (cap && /[a-z]/.test(ch)) {
      const prev = i > 0 ? text[i - 1] : " ";
      const isWordBreak = prev === " " || prev === "\t" || prev === "\n";
      // Don't capitalize if the last non-space char is a symbol (#tag, $5, /path, @user).
      const blocked = lastNonSpace !== "" && NON_CAP_BEFORE.test(lastNonSpace);
      if (isWordBreak && !blocked) {
        out += ch.toUpperCase();
        cap = false;
        lastNonSpace = ch.toUpperCase();
        continue;
      }
      out += ch;
      cap = false;
      lastNonSpace = ch;
      continue;
    }
    out += ch;
    if (ch === "." || ch === "?" || ch === "!" || ch === "\n") cap = true;
    // Digits consume the first-cap flag so "21 pilots" keeps pilots lowercase.
    if (cap && ch >= "0" && ch <= "9") cap = false;
    if (!/\s/.test(ch)) lastNonSpace = ch;
  }
  // standalone pronoun "i" -> "I"
  out = out.replace(/\bi\b/g, "I");
  return out;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------
export function processVoiceTranscript(raw: string, prevText: string): VoiceResult {
  let text = (raw || "").trim();
  if (!text) return { text: "", command: null };

  // 1) Exact control commands (strip trailing punctuation Whisper may add,
  //    e.g. "Clear." -> "clear", "scratch that." -> "scratch that")
  const normalized = text.replace(/[.,;:!?]+$/, "").trim().toLowerCase();
  const exact = CONTROL_EXACT[normalized];
  if (exact) return { text: "", command: exact };

  // 2) Trailing "pause" / "stop" after dictation
  let command: VoiceCommand | null = null;
  const trailing = /[,\s]+(pause|stop)$/i.exec(text);
  if (trailing) {
    command = "pause";
    text = text.slice(0, trailing.index).trim();
  }

  // 3) Numbers
  text = convertNumberRuns(text);

  // 4) Symbols / emojis / structure
  text = replaceCommands(text);

  // 5) Clean spacing around punctuation
  text = cleanSpacing(text);

  // 6) Smart capitalization
  const trimmedPrev = prevText.trimEnd();
  const capitalizeFirst = trimmedPrev.length === 0 || /[.!?\n]$/.test(trimmedPrev);
  text = smartCapitalize(text, capitalizeFirst);

  return { text, command };
}
