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
  /** A summary's recordings with their transcripts (cached; the reader asks once when it opens). */
  recordings: (lecture: LectureSummary) => Promise<RecordingInput[]>;
}

const COPY_FAILED = "Nie udało się skopiować. Pozwól stronie na dostęp do schowka i spróbuj jeszcze raz.";

/**
 * "Ucz się w ChatGPT" / "Test w ChatGPT": the study pack to the clipboard,
 * then ChatGPT (the project, when one is set) in a new tab. A transcript that
 * will not load leaves the pack with the summary only, and says so.
 */
export async function studyInChatGpt(src: StudySource, lecture: LectureSummary, mode: StudyMode): Promise<void> {
  let rows: RecordingInput[] = [];
  let noTranscript = false;
  if (lecture.kind === "summary") {
    try {
      rows = await src.recordings(lecture);
    } catch {
      noTranscript = true;
    }
  }
  const pack = buildStudyPack({ lecture, rows, mode, learningMode: src.learningMode, projectUrl: src.projectUrl });
  if (!(await copyText(pack))) {
    toast.error(COPY_FAILED);
    return;
  }
  const target = chatGptTarget(src.projectUrl);
  const opened = openInNewTab(target);
  toast.success("Skopiowano — wklej w ChatGPT", {
    description: noTranscript ? "Bez fragmentów zapisu: nie udało się ich wczytać." : undefined,
    action: opened ? undefined : { label: "Otwórz ChatGPT", onClick: () => void openInNewTab(target) },
  });
}

/** "Przegadaj w Claude": one instruction; Claude Desktop reads the note and the learning mode from the vault. */
export async function talkInClaude(lecture: LectureSummary): Promise<void> {
  if (!(await copyText(claudeInstruction(lecture)))) {
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
