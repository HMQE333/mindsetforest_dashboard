/**
 * Notes that look like they hold secrets: passwords, login pairs, API keys,
 * private keys, card numbers, recovery codes. Read on the device only, with
 * fixed patterns (no model sees the note for this), and the result names the
 * kinds found, never the values. A password manager is the place for these.
 */
export type SensitiveKind = "password" | "login" | "key" | "card" | "bank" | "recovery";

export const SENSITIVE_LABEL: Record<SensitiveKind, string> = {
  password: "password",
  login: "login + password",
  key: "API key / private key",
  card: "card number",
  bank: "bank account",
  recovery: "recovery codes",
};

// "password: x", "hasło = x", "pin: 1234" (a value must follow on the line).
const PASSWORD_LABEL = /(?:^|[^\p{L}])(?:password|passwd|passcode|pass|pwd|has[łl]o|pin|kod\s+pin)\s*[:=–-]\s*\S{3,}/imu;
const LOGIN_LABEL = /(?:^|[^\p{L}])(?:login|user(?:name)?|u[żz]ytkownik|e-?mail|konto|account)\s*[:=–-]\s*\S{3,}/imu;
// "name@mail.com:secret" or "name@mail.com | secret" on one line.
const EMAIL_PAIR = /[\w.+-]+@[\w-]+\.[\w.-]+\s*(?::|\||\/|\s{2,}|\t)\s*[^\s@]{6,}\s*$/mu;
const KEYS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/,
  /\bsk-(?:ant-|proj-|live_|test_)?[A-Za-z0-9_-]{20,}/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /(?:^|[^\p{L}])(?:api[\s_-]?key|secret|token|klucz\s+api)\s*[:=]\s*[A-Za-z0-9_\-./+]{16,}/imu,
];
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/;
const RECOVERY = /(?:seed\s+phrase|recovery\s+(?:phrase|codes?)|backup\s+codes?|mnemonic|kody?\s+(?:zapasowe|odzyskiwania)|fraza\s+odzyskiwania)/iu;

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function hasCard(text: string): boolean {
  for (const m of text.matchAll(CARD_CANDIDATE)) {
    const digits = m[0].replace(/[ -]/g, "");
    // Real card prefixes only (Visa, Mastercard, Amex, Discover...): a long id or phone number is not one.
    if (digits.length >= 13 && digits.length <= 19 && /^(?:4|5[1-5]|2[2-7]|3[47]|6)/.test(digits) && !/^(\d)\1+$/.test(digits) && luhn(digits)) return true;
  }
  return false;
}

/** The kinds of secret the text seems to hold (empty when none). */
export function scanSensitive(text: string | null | undefined): SensitiveKind[] {
  const t = String(text ?? "");
  if (t.length < 6) return [];
  const out: SensitiveKind[] = [];
  const password = PASSWORD_LABEL.test(t);
  if ((password && LOGIN_LABEL.test(t)) || EMAIL_PAIR.test(t)) out.push("login");
  else if (password) out.push("password");
  if (KEYS.some((r) => r.test(t))) out.push("key");
  if (hasCard(t)) out.push("card");
  if (IBAN.test(t)) out.push("bank");
  if (RECOVERY.test(t)) out.push("recovery");
  return out;
}

/** "login + password, API key / private key" */
export const describeSensitive = (kinds: readonly SensitiveKind[]) => kinds.map((k) => SENSITIVE_LABEL[k]).join(", ");

const cache = new Map<string, { content: string; kinds: SensitiveKind[] }>();
/** scanSensitive, read once per note version (a note's content is the key). */
export function noteSensitivity(id: string, content: string | null | undefined): SensitiveKind[] {
  const c = String(content ?? "");
  const hit = cache.get(id);
  if (hit && hit.content === c) return hit.kinds;
  const kinds = scanSensitive(c);
  cache.set(id, { content: c, kinds });
  return kinds;
}

/**
 * A short fingerprint of a note's text. "Not sensitive" is kept with it, so
 * a note edited afterwards (a real password added) is checked again.
 */
export function textFingerprint(text: string | null | undefined): string {
  const t = String(text ?? "");
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return `${t.length.toString(36)}.${(h >>> 0).toString(36)}`;
}
