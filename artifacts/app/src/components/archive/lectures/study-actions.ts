import { toast } from "sonner";
import type { LectureSummary } from "@/lib/kos-vault";
import { buildCoursePack, buildStudyPack, claudeInstruction, type RecordingInput, type StudyMode } from "@/lib/lecture-tutor";
import { copyText, downloadText, openInNewTab } from "@/lib/hand-off";
import { chatGptTarget } from "@/lib/study-prompts";

/** What the hand-off buttons need from outside the reader: the settings and the transcripts. */
export interface StudySource {
  /** Settings > AI Context > Tryb nauki ("" for the built-in summary). */
  learningMode: string;
  /** Settings > AI Context > ChatGPT project link, "" when not set. */
  projectUrl: string;
  /** A summary's recordings with their transcripts; the reader loads them when it opens and keeps them. */
  recordings: (lecture: LectureSummary) => Promise<RecordingInput[]>;
}

/** A summary's transcript as the reader holds it when a button is pressed. */
export type Material = { state: "loading" } | { state: "ready"; rows: RecordingInput[] } | { state: "failed" };

const COPY_FAILED = "Nie udało się skopiować. Pozwól stronie na dostęp do schowka i spróbuj jeszcze raz.";

/** A blocked tab leaves the toast's button as the only way in: long enough to tap on a phone. */
const BLOCKED_TOAST_MS = 20_000;

/**
 * "Ucz się w ChatGPT" / "Test w ChatGPT": the study pack to the clipboard,
 * then ChatGPT (the project, when one is set) in a new tab.
 *
 * Nothing is fetched here: Safari (and every browser on iOS) copies only
 * inside the click, so the pack is built from what the reader already holds
 * and the copy starts before the first await. A transcript still loading, or
 * one that would not load, leaves the pack with the summary only, and says so.
 */
export async function studyInChatGpt(src: StudySource, lecture: LectureSummary, mode: StudyMode, material: Material): Promise<void> {
  const summary = lecture.kind === "summary";
  const rows = summary && material.state === "ready" ? material.rows : [];
  const pack = buildStudyPack({ lecture, rows, mode, learningMode: src.learningMode, projectUrl: src.projectUrl });
  if (!(await copyText(pack))) {
    toast.error(COPY_FAILED);
    return;
  }
  const target = chatGptTarget(src.projectUrl);
  const opened = openInNewTab(target);
  const missing = !summary
    ? undefined
    : material.state === "loading"
      ? "Bez fragmentów zapisu: jeszcze się wczytują. Naciśnij za chwilę jeszcze raz, żeby je dołączyć."
      : material.state === "failed"
        ? "Bez fragmentów zapisu: nie udało się ich wczytać."
        : undefined;
  toast.success(
    "Skopiowano — wklej w ChatGPT",
    opened
      ? { description: missing, action: undefined }
      : {
          description: missing ?? "Przeglądarka nie otworzyła nowej karty.",
          action: { label: "Otwórz ChatGPT", onClick: () => void openInNewTab(target) },
          duration: BLOCKED_TOAST_MS,
        },
  );
}

/** "Przegadaj w Claude": one instruction; Claude Desktop reads the note and the learning mode from the vault. */
export async function talkInClaude(lecture: LectureSummary, learningMode: string): Promise<void> {
  if (!(await copyText(claudeInstruction(lecture, learningMode)))) {
    toast.error(COPY_FAILED);
    return;
  }
  toast.success("Skopiowano — wklej w Claude Desktop", { description: "Claude sam przeczyta notatkę ze skarbca." });
}

/** "Pakiet przedmiotu": one Markdown file with the course's textbook, summaries and glossary. */
export function downloadCoursePack(group: { course: string; lectures: LectureSummary[]; textbook: LectureSummary | null }): void {
  const pack = buildCoursePack(group);
  downloadText(pack.fileName, pack.text);
  toast.success(`Pobrano „${pack.fileName}”`, { description: "Wgraj go do projektu w ChatGPT albo Claude." });
}
