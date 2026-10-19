import { describe, it, expect } from "vitest";
import {
  DELETE_GRACE_MS,
  SHARE_TTL_MS,
  displayName,
  formatRemaining,
  formatSize,
  legacyShareFolder,
  linkedFrom,
  nameTimestamp,
  planShare,
  safeFileName,
  sameListing,
  shareFolder,
  shareObjectName,
  toSharedFile,
  type SharedFile,
  type StorageEntry,
} from "../components/archive/file-share";

const UID = "11111111-2222-3333-4444-555555555555";
const T0 = Date.UTC(2026, 9, 19, 12, 0, 0);

function entry(name: string, createdAt: number | null, extra: Partial<StorageEntry> = {}): StorageEntry {
  return { name, id: `id-${name}`, created_at: createdAt === null ? null : new Date(createdAt).toISOString(), metadata: { size: 1234, mimetype: "application/pdf" }, ...extra };
}

describe("folders", () => {
  it("puts new uploads under the user's own first folder, which the bucket's delete policy covers", () => {
    expect(shareFolder(UID)).toBe(`${UID}/file-share`);
    expect(legacyShareFolder(UID)).toBe(`file-share/${UID}`);
  });
});

describe("safeFileName / shareObjectName", () => {
  it("keeps a readable name storage accepts", () => {
    expect(safeFileName("Wykład 3 – zbiory (final).pdf")).toBe("Wyklad 3 _ zbiory (final).pdf");
    expect(safeFileName("Łódź żółć.txt")).toBe("Lodz zolc.txt");
    expect(safeFileName("a/b\\c?.png")).toBe("a_b_c_.png");
    expect(safeFileName("???")).toBe("file");
    expect(safeFileName("")).toBe("file");
  });

  it("caps the length and keeps the extension", () => {
    const long = `${"a".repeat(200)}.mp4`;
    const safe = safeFileName(long);
    expect(safe.length).toBe(80);
    expect(safe.endsWith(".mp4")).toBe(true);
  });

  it("names an object by time, a random part and the file's name, and reads them back", () => {
    const name = shareObjectName("Notatki.pdf", T0, "ab12cd");
    expect(name).toBe(`${T0}-ab12cd--Notatki.pdf`);
    expect(displayName(name)).toBe("Notatki.pdf");
    expect(nameTimestamp(name)).toBe(T0);
  });

  it("reads the old naming, which kept only the extension", () => {
    expect(displayName(`${T0}-x9y8z7.mp4`)).toBe("mp4 file");
    expect(nameTimestamp(`${T0}-x9y8z7.mp4`)).toBe(T0);
    expect(displayName("something else")).toBe("something else");
    expect(nameTimestamp("something else")).toBeNull();
  });
});

describe("toSharedFile", () => {
  it("takes the time from the server, the same on every device", () => {
    const f = toSharedFile(shareFolder(UID), entry(shareObjectName("a.pdf", T0 - 5000, "r"), T0))!;
    expect(f.path).toBe(`${UID}/file-share/${T0 - 5000}-r--a.pdf`);
    expect(f.name).toBe("a.pdf");
    expect(f.uploadedAt).toBe(T0);
    expect(f.expiresAt).toBe(T0 + SHARE_TTL_MS);
    expect(f.size).toBe(1234);
    expect(f.legacy).toBe(false);
  });

  it("falls back to the time in the name", () => {
    const f = toSharedFile(legacyShareFolder(UID), entry(`${T0}-abc.zip`, null), true)!;
    expect(f.uploadedAt).toBe(T0);
    expect(f.legacy).toBe(true);
    expect(f.path).toBe(`file-share/${UID}/${T0}-abc.zip`);
  });

  it("skips folders, placeholders and entries with no time at all", () => {
    expect(toSharedFile("x", { name: "sub", id: null, created_at: null })).toBeNull();
    expect(toSharedFile("x", entry(".emptyFolderPlaceholder", T0))).toBeNull();
    expect(toSharedFile("x", entry("no-time-here", null))).toBeNull();
  });
});

function file(name: string, uploadedAt: number, over: Partial<SharedFile> = {}): SharedFile {
  return { path: `${UID}/file-share/${name}`, name, size: 1, mimetype: "", uploadedAt, expiresAt: uploadedAt + SHARE_TTL_MS, legacy: false, ...over };
}

describe("planShare (expiry)", () => {
  const now = T0;
  const fresh = file("fresh", now - 60_000);
  const soon = file("soon", now - SHARE_TTL_MS + 30_000);
  const inGrace = file("grace", now - SHARE_TTL_MS - DELETE_GRACE_MS + 1000);
  const expired = file("expired", now - SHARE_TTL_MS - DELETE_GRACE_MS - 1);
  const linked = file("linked", now - 3_600_000);

  it("shows live files soonest-first, keeps linked ones, deletes the rest after the grace", () => {
    const plan = planShare([fresh, inGrace, expired, soon, linked], now, (f) => f === linked);
    expect(plan.active).toEqual([soon, fresh]);
    expect(plan.kept).toEqual([linked]);
    expect(plan.expired).toEqual([expired]);
  });

  it("never deletes a file still within its time, whatever the links say", () => {
    const justSent = file("just-sent", now);
    const plan = planShare([justSent], now + SHARE_TTL_MS - 1, () => false);
    expect(plan.active).toEqual([justSent]);
    expect(plan.expired).toEqual([]);
  });

  it("deletes the old forgotten uploads (legacy prefix) like any other", () => {
    const old = file("old", now - 30 * 86_400_000, { legacy: true, path: `file-share/${UID}/old` });
    expect(planShare([old], now, () => false).expired).toEqual([old]);
  });
});

describe("linkedFrom", () => {
  it("finds a file whose public URL was pasted into a note", () => {
    const f = file("doc.pdf", T0);
    const url = `https://proj.supabase.co/storage/v1/object/public/archive-images/${f.path}`;
    expect(linkedFrom(["nothing", `see ${url}`], f)).toBe(true);
    expect(linkedFrom(["nothing"], f)).toBe(false);
  });

  it("finds a file with spaces in its name from the link the app copies (getPublicUrl encodes it)", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const name = shareObjectName("Wykład 3 notatki.pdf", T0, "ab12cd");
    const f = toSharedFile(shareFolder(UID), entry(name, T0))!;
    expect(f.path).toContain(" ");
    const client = createClient("https://proj.supabase.co", "anon-key", { auth: { persistSession: false, autoRefreshToken: false } });
    const url = client.storage.from("archive-images").getPublicUrl(f.path).data.publicUrl;
    expect(url).toContain("Wyklad%203%20notatki.pdf");
    expect(linkedFrom([`notatki: ${url}`], f)).toBe(true);
    // Pasted decoded (as some apps show a link) still counts.
    expect(linkedFrom([`notatki: https://proj.supabase.co/storage/v1/object/public/archive-images/${f.path}`], f)).toBe(true);
    expect(linkedFrom(["Wyklad%203"], f)).toBe(false);
  });
});

describe("sameListing", () => {
  it("compares paths, times and sizes in order", () => {
    const a = file("a", T0);
    const b = file("b", T0);
    expect(sameListing([a, b], [{ ...a }, { ...b }])).toBe(true);
    expect(sameListing([a, b], [b, a])).toBe(false);
    expect(sameListing([a], [{ ...a, size: 2 }])).toBe(false);
    expect(sameListing([], [])).toBe(true);
  });
});

describe("formatting", () => {
  it("shows the time left as m:ss, never negative", () => {
    expect(formatRemaining(SHARE_TTL_MS)).toBe("7:00");
    expect(formatRemaining(61_500)).toBe("1:01");
    expect(formatRemaining(-5000)).toBe("0:00");
  });

  it("shows sizes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
