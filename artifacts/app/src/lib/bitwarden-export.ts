/**
 * Notes holding logins, as a Bitwarden import file ("Bitwarden (csv)" in
 * Tools > Import data). One login per line the note writes in a shape we can
 * read, else the whole note as a Secure Note, so nothing is left behind:
 *   mail@x.com:password service      service mail@x.com:password
 *   service | user | password        login: x / password: y (anywhere in a note)
 * Runs on the device; the file holds plain passwords and is meant to be
 * imported and deleted.
 */
export interface BitwardenItem {
  type: "login" | "note";
  name: string;
  notes?: string;
  uri?: string;
  username?: string;
  password?: string;
}

const URLISH = /^(?:https?:\/\/|www\.)\S+$|^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/i;
const PASS_LABEL = /^\s*(?:password|passwd|pass|pwd|has[łl]o)\s*[:=]\s*(\S.*)$/imu;
const USER_LABEL = /^\s*(?:login|user(?:name)?|u[żz]ytkownik|e-?mail|konto|account)\s*[:=]\s*(\S+)/imu;

function serviceFrom(words: string[]): { name: string; uri?: string } {
  const text = words.join(" ").replace(/^[-–:|,]+|[-–:|,]+$/g, "").trim();
  const url = words.find((w) => URLISH.test(w));
  if (url) {
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    let host = url;
    try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { /* keep as written */ }
    const rest = words.filter((w) => w !== url).join(" ").trim();
    return { name: rest || host, uri: href };
  }
  return { name: text };
}

/** One line as a login, or null. */
export function parseLoginLine(line: string): Omit<BitwardenItem, "type"> | null {
  const l = line.trim();
  if (!l) return null;
  const bars = l.split(/\s*\|\s*/);
  if (bars.length === 3 && bars.every(Boolean)) {
    const s = serviceFrom(bars[0].split(/\s+/));
    return { ...s, username: bars[1], password: bars[2] };
  }
  const words = l.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^https?:\/\//i.test(w)) continue;
    const at = w.indexOf(":");
    if (at <= 0 || at === w.length - 1) continue;
    const user = w.slice(0, at), pass = w.slice(at + 1);
    // user@mail:pass, or a bare username with a password of 4+ characters (not a time like 12:30).
    if (/^\d+$/.test(user) || pass.length < 4 || /^\/\//.test(pass)) continue;
    if (!user.includes("@") && !/^[\p{L}\d._-]{2,}$/u.test(user)) continue;
    const others = words.filter((_, j) => j !== i);
    return { ...serviceFrom(others), username: user, password: pass };
  }
  return null;
}

/** The items one note becomes. `title` names the note. */
export function noteToItems(title: string, content: string): BitwardenItem[] {
  const text = String(content ?? "");
  const pass = PASS_LABEL.exec(text);
  if (pass) {
    const user = USER_LABEL.exec(text);
    const url = text.match(/https?:\/\/\S+/)?.[0];
    return [{ type: "login", name: title || "Imported login", username: user?.[1], password: pass[1].trim(), uri: url, notes: text }];
  }
  const logins: BitwardenItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const p = parseLoginLine(line);
    if (p) logins.push({ type: "login", ...p, name: p.name || title || p.username || "Imported login" });
  }
  return logins.length ? logins : [{ type: "note", name: title || "Imported note", notes: text }];
}

const COLUMNS = ["folder", "favorite", "type", "name", "notes", "fields", "reprompt", "login_uri", "login_username", "login_password", "login_totp"] as const;
const cell = (v: string | undefined) => {
  const s = v ?? "";
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Bitwarden's CSV, every item in the folder `folder`. */
export function toBitwardenCsv(items: readonly BitwardenItem[], folder = "MindsetForest"): string {
  const rows = items.map((it) =>
    [folder, "", it.type, it.name, it.notes, "", "0", it.type === "login" ? it.uri : "", it.username, it.password, ""].map(cell).join(","),
  );
  return [COLUMNS.join(","), ...rows].join("\n") + "\n";
}
