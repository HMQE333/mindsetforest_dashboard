import { supabase } from "@/integrations/supabase/client";

/**
 * A profile photo is stored as its public URL in user_profiles.avatar_emoji
 * (see migration 20261028120000_avatar_photos.sql). Only URLs from our own
 * avatars bucket count as photos; anything else is shown as text (an emoji).
 */
const PHOTO_PREFIX = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/storage/v1/object/public/avatars/`;

export const isPhotoAvatar = (value: string | null | undefined): value is string =>
  !!value && PHOTO_PREFIX.length > 40 && value.startsWith(PHOTO_PREFIX) && !value.includes("..");

/**
 * Square-crop and shrink the picture to 256 px WebP in the browser (small,
 * and a re-encode drops EXIF data such as the GPS position), upload it under
 * avatars/<user>/, and resolve its public URL.
 */
export async function uploadAvatarPhoto(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read the image");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
  if (!blob) throw new Error("Couldn't read the image");
  // A new name each time, so friends' browsers don't keep showing the old picture.
  const path = `${userId}/${Date.now().toString(36)}.webp`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

/** Remove the user's older photos (best effort; the current one stays). */
export async function pruneAvatarPhotos(userId: string, keepUrl: string | null): Promise<void> {
  const { data } = await supabase.storage.from("avatars").list(userId, { limit: 100 });
  const stale = (data ?? []).map((o) => `${userId}/${o.name}`).filter((p) => !keepUrl || !keepUrl.endsWith(`/avatars/${p}`));
  if (stale.length) await supabase.storage.from("avatars").remove(stale);
}
