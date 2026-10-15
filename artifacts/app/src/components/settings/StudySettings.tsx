import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStudyPrompts } from "@/hooks/useStudyPrompts";
import { isChatGptUrl, type StudyPromptKind, type StudyPrompts } from "@/lib/study-prompts";

interface Field {
  key: "learning_mode" | "primer_prompt";
  kind: StudyPromptKind;
  label: string;
  hint: string;
  /** What "Wczytaj z Archiwum" looks for, said the way the user would. */
  looksFor: string;
  rows: number;
}

const FIELDS: Field[] = [
  {
    key: "learning_mode",
    kind: "learning",
    label: "Tryb nauki",
    hint: "Jak AI ma Cię uczyć. Trafia do pakietów dla ChatGPT i do skarbca (_SYSTEM/learning-mode.md) dla Claude.",
    looksFor: "notatki zaczynającej się od „Tryb nauki”",
    rows: 8,
  },
  {
    key: "primer_prompt",
    kind: "primer",
    label: "Prompt podręcznika (Primer)",
    hint: "Według niego rutyna pisze podręcznik każdego przedmiotu (_SYSTEM/primer-prompt.md).",
    looksFor: "promptu z „compact, self-contained primer”",
    rows: 6,
  },
];

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
};

const sameAs = (a: StudyPrompts, b: StudyPrompts) =>
  a.learning_mode === b.learning_mode && a.primer_prompt === b.primer_prompt && a.chatgpt_project_url.trim() === b.chatgpt_project_url.trim();

/**
 * Settings > AI Context > Nauka: the study prompts, one source of truth for
 * ChatGPT (the study packs) and Claude Desktop (the tracker copies them into
 * the vault). Saved on its own, apart from the context shelves above.
 */
export default function StudySettings() {
  const { prompts, available, loading, save, findInArchive } = useStudyPrompts();
  const [draft, setDraft] = useState<StudyPrompts>(prompts);
  const [saving, setSaving] = useState(false);
  const [finding, setFinding] = useState<StudyPromptKind | null>(null);

  useEffect(() => {
    setDraft(prompts);
  }, [prompts]);

  const dirty = !sameAs(draft, prompts);
  const url = draft.chatgpt_project_url.trim();
  const badUrl = url !== "" && !isChatGptUrl(url);
  const disabled = loading || !available;

  const load = async (f: Field) => {
    setFinding(f.kind);
    try {
      const hit = await findInArchive(f.kind);
      if (!hit) {
        toast.error(`Nie ma w Archiwum ${f.looksFor}.`);
        return;
      }
      setDraft((d) => ({ ...d, [f.key]: hit.content.trim() }));
      toast.success(`Wczytano z Archiwum (${shortDate(hit.created_at)}). Zapisz, żeby zachować.`);
    } catch {
      toast.error("Nie udało się przeszukać Archiwum.");
    } finally {
      setFinding(null);
    }
  };

  const onSave = async () => {
    setSaving(true);
    const res = await save(draft);
    setSaving(false);
    if (res.ok) toast.success("Zapisano ustawienia nauki");
    else toast.error(res.error);
  };

  return (
    <section className="space-y-4 rounded-xl border border-white/10 bg-background/40 px-4 py-4" aria-labelledby="study-settings-title" lang="pl">
      <div>
        <h3 id="study-settings-title" className="text-sm font-bold text-foreground mb-1">🎓 Nauka</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Długa nauka idzie przez Twoje subskrypcje (ChatGPT, Claude Desktop), nie przez asystenta. Te teksty dołączają przyciski w Archiwum → Wykłady.
        </p>
        {!available && (
          <p className="mt-2 text-[11px] text-amber-300/90">
            Baza nie ma jeszcze tych pól. Pojawią się po migracji <code className="font-mono">20261015180000_study_prompts.sql</code>.
          </p>
        )}
      </div>

      {FIELDS.map((f) => (
        <div key={f.key}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label htmlFor={`study-${f.key}`} className="text-xs font-bold text-foreground">{f.label}</label>
            <button
              type="button"
              onClick={() => void load(f)}
              disabled={disabled || finding !== null}
              className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-[11px] text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
            >
              {finding === f.kind ? "Szukam…" : "Wczytaj z Archiwum"}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">{f.hint}</p>
          <textarea
            id={`study-${f.key}`}
            value={draft[f.key]}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            disabled={disabled}
            rows={f.rows}
            placeholder={f.kind === "learning" ? "Tryb nauki: mój spersonalizowany workflow…" : "I want you to create a compact, self-contained primer on [SUBJECT]…"}
            className="w-full bg-background/60 border border-white/10 rounded-xl px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 resize-y leading-relaxed disabled:opacity-60"
          />
          <p className="mt-0.5 text-right text-[10px] text-muted-foreground/70 tabular-nums">
            {draft[f.key].length > 0 ? `${draft[f.key].length.toLocaleString("pl-PL")} znaków` : "puste"}
          </p>
        </div>
      ))}

      <div>
        <label htmlFor="study-chatgpt" className="text-xs font-bold text-foreground">
          Link do projektu w ChatGPT <span className="font-normal text-muted-foreground">(opcjonalnie)</span>
        </label>
        <p className="text-[11px] text-muted-foreground mt-1 mb-2 leading-relaxed">
          Wklej tryb nauki do instrukcji projektu: wtedy pakiet go nie powtarza, a przycisk otwiera ten projekt.
        </p>
        <input
          id="study-chatgpt"
          type="url"
          inputMode="url"
          value={draft.chatgpt_project_url}
          onChange={(e) => setDraft((d) => ({ ...d, chatgpt_project_url: e.target.value }))}
          disabled={disabled}
          placeholder="https://chatgpt.com/g/g-p-…/project"
          aria-invalid={badUrl}
          aria-describedby={badUrl ? "study-chatgpt-error" : undefined}
          className={`w-full bg-background/60 border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 disabled:opacity-60 ${badUrl ? "border-rose-400/60" : "border-white/10"}`}
        />
        {badUrl && (
          <p id="study-chatgpt-error" className="mt-1 text-[11px] text-rose-300">Tylko link https://chatgpt.com/…</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <button
            type="button"
            onClick={() => setDraft(prompts)}
            className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs text-muted-foreground hover:text-foreground transition-all"
          >
            Cofnij
          </button>
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!dirty || saving || badUrl || disabled}
          className="px-4 py-2 rounded-xl gradient-purple text-primary-foreground text-xs font-bold glow-sm hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:translate-y-0"
        >
          {saving ? "Zapisuję…" : "Zapisz naukę"}
        </button>
      </div>
    </section>
  );
}
