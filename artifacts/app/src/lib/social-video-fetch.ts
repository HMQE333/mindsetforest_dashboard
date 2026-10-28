import { invokeFunction } from "@/lib/function-error";
import type { SocialNote } from "@/lib/social-video";

/** Transcript and key points for the video; waits for a long transcript (up to ~3 minutes). */
export async function fetchSocialNote(url: string): Promise<SocialNote> {
  let res = await invokeFunction<{ status: string; jobId?: string; note?: SocialNote }>("social-transcript", { url });
  for (let i = 0; res.status === "pending" && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    res = await invokeFunction("social-transcript", { url, jobId: res.jobId });
  }
  if (res.status !== "done" || !res.note) throw new Error("The transcript is taking too long; try again in a minute");
  return res.note;
}
