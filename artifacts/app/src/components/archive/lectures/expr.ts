/**
 * A small, safe parser for the expressions in ```plot and ```plot3d blocks:
 * numbers, x, y, pi, e, + - * / ^, parentheses, unary minus and a fixed list of
 * functions. It builds a tree of closures; nothing is ever passed to eval or
 * new Function, so a summary cannot run code in the page.
 *
 * Precedence, loosest first: + -, then * / (and implicit multiplication such
 * as 2x or 3(x+1)), then unary minus, then ^ (right-associative). So -x^2 is
 * -(x^2) and 2^-1 is 0.5, as in maths.
 */

export type Vars = { x?: number; y?: number };
export type Compiled = (v: Vars) => number;

export const FUNCTIONS: Record<string, (a: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Own keys only: "constructor" or "__proto__" must not reach Object.prototype. */
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export type ExprErrorCode = "empty" | "unexpected" | "unknown" | "paren" | "call" | "variable" | "end";

export class ExprError extends Error {
  constructor(
    public code: ExprErrorCode,
    public token: string,
    public at: number,
  ) {
    super(`${code}: ${token} at ${at}`);
  }
}

type Tok = { k: "num"; v: number; at: number } | { k: "id"; v: string; at: number } | { k: "op"; v: string; at: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) {
      out.push({ k: "num", v: Number(num[0]), at: i });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-zπ]+/.exec(src.slice(i));
    if (id) {
      out.push({ k: "id", v: id[0] === "π" ? "pi" : id[0].toLowerCase(), at: i });
      i += id[0].length;
      continue;
    }
    if ("+-*/^()".includes(c)) {
      out.push({ k: "op", v: c, at: i });
      i++;
      continue;
    }
    // Common typographic forms of the same operators.
    const alias: Record<string, string> = { "−": "-", "×": "*", "·": "*", "÷": "/" };
    if (alias[c]) {
      out.push({ k: "op", v: alias[c], at: i });
      i++;
      continue;
    }
    throw new ExprError("unexpected", c, i);
  }
  return out;
}

/**
 * Compiles `src` with the allowed variables (["x"] for a 2D plot, ["x", "y"]
 * for a surface). Throws ExprError with a code and the offending token.
 */
export function compile(src: string, vars: readonly ("x" | "y")[] = ["x", "y"]): Compiled {
  const toks = tokenize(src);
  if (toks.length === 0) throw new ExprError("empty", "", 0);
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (t: Tok | undefined, v: string) => !!t && t.k === "op" && t.v === v;

  const startsOperand = (t: Tok | undefined) => !!t && (t.k === "num" || t.k === "id" || isOp(t, "("));

  function expr(): Compiled {
    let left = term();
    while (isOp(peek(), "+") || isOp(peek(), "-")) {
      const op = toks[pos++].v;
      const a = left;
      const b = term();
      left = op === "+" ? (v) => a(v) + b(v) : (v) => a(v) - b(v);
    }
    return left;
  }

  function term(): Compiled {
    let left = unary();
    for (;;) {
      if (isOp(peek(), "*") || isOp(peek(), "/")) {
        const op = toks[pos++].v;
        const a = left;
        const b = unary();
        left = op === "*" ? (v) => a(v) * b(v) : (v) => a(v) / b(v);
      } else if (startsOperand(peek())) {
        // Implicit multiplication: 2x, 2pi, 3(x+1), (x+1)(x-1), x y.
        const a = left;
        const b = power();
        left = (v) => a(v) * b(v);
      } else return left;
    }
  }

  function unary(): Compiled {
    if (isOp(peek(), "-")) {
      pos++;
      const a = unary();
      return (v) => -a(v);
    }
    if (isOp(peek(), "+")) {
      pos++;
      return unary();
    }
    return power();
  }

  function power(): Compiled {
    const base = primary();
    if (isOp(peek(), "^")) {
      pos++;
      const exp = unary();
      return (v) => Math.pow(base(v), exp(v));
    }
    return base;
  }

  function primary(): Compiled {
    const t = peek();
    if (!t) throw new ExprError("end", "", src.length);
    if (t.k === "num") {
      pos++;
      const n = t.v;
      return () => n;
    }
    if (isOp(t, "(")) {
      pos++;
      const inner = expr();
      if (!isOp(peek(), ")")) throw new ExprError("paren", peek()?.k === "op" || peek()?.k === "id" ? String(peek()!.v) : "", peek()?.at ?? src.length);
      pos++;
      return inner;
    }
    if (t.k === "id") {
      pos++;
      const fn = own(FUNCTIONS, t.v) ? FUNCTIONS[t.v] : null;
      if (fn) {
        if (!isOp(peek(), "(")) throw new ExprError("call", t.v, t.at);
        pos++;
        const arg = expr();
        if (!isOp(peek(), ")")) throw new ExprError("paren", t.v, peek()?.at ?? src.length);
        pos++;
        return (v) => fn(arg(v));
      }
      if (own(CONSTANTS, t.v)) {
        const c = CONSTANTS[t.v];
        return () => c;
      }
      if (t.v === "x" || t.v === "y") {
        if (!vars.includes(t.v)) throw new ExprError("variable", t.v, t.at);
        const name = t.v;
        return (v) => v[name] ?? NaN;
      }
      throw new ExprError("unknown", t.v, t.at);
    }
    throw new ExprError("unexpected", t.v as string, t.at);
  }

  const out = expr();
  if (pos < toks.length) {
    const t = toks[pos];
    throw new ExprError("unexpected", String(t.v), t.at);
  }
  return out;
}

/** A readable message for a parse error, in the note's language. */
export function exprErrorText(e: unknown, src: string, lang: "pl" | "en"): string {
  if (!(e instanceof ExprError)) return lang === "pl" ? `Błąd w wyrażeniu „${src}”.` : `Error in the expression "${src}".`;
  const q = (s: string) => (lang === "pl" ? `„${s}”` : `"${s}"`);
  const where = lang === "pl" ? ` w ${q(src)}` : ` in ${q(src)}`;
  const pl: Record<ExprErrorCode, string> = {
    empty: "Puste wyrażenie.",
    unexpected: `Nieoczekiwany znak ${q(e.token)}${where}.`,
    unknown: `Nieznana nazwa ${q(e.token)}${where}. Dozwolone: x, y, pi, e i funkcje ${Object.keys(FUNCTIONS).join(", ")}.`,
    paren: `Brakuje nawiasu zamykającego${where}.`,
    call: `Funkcja ${q(e.token)} wymaga nawiasów, np. ${e.token}(x)${where}.`,
    variable: `Zmienna ${q(e.token)} nie jest tu dozwolona${where}.`,
    end: `Wyrażenie urywa się${where}.`,
  };
  const en: Record<ExprErrorCode, string> = {
    empty: "Empty expression.",
    unexpected: `Unexpected ${q(e.token)}${where}.`,
    unknown: `Unknown name ${q(e.token)}${where}. Allowed: x, y, pi, e and the functions ${Object.keys(FUNCTIONS).join(", ")}.`,
    paren: `Missing closing parenthesis${where}.`,
    call: `The function ${q(e.token)} needs parentheses, e.g. ${e.token}(x)${where}.`,
    variable: `The variable ${q(e.token)} is not allowed here${where}.`,
    end: `The expression ends too early${where}.`,
  };
  return (lang === "pl" ? pl : en)[e.code];
}
