import { isPhotoAvatar } from "@/lib/avatar";

/** A user's avatar: their photo (from our avatars bucket) or their emoji. `size` in px. */
export default function UserAvatar({ value, size = 24, className = "" }: { value: string | null | undefined; size?: number; className?: string }) {
  if (isPhotoAvatar(value)) {
    return (
      <img
        src={value}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`inline-block shrink-0 rounded-full object-cover bg-white/5 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`} style={{ fontSize: Math.round(size * 0.8), width: size, height: size }}>
      {value || "🦊"}
    </span>
  );
}
