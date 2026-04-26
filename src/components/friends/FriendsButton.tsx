import { Users } from "lucide-react";

interface FriendsButtonProps {
  badgeCount: number;
  onClick: () => void;
}

export default function FriendsButton({ badgeCount, onClick }: FriendsButtonProps) {
  return (
    <button
      onClick={onClick}
      className="relative hidden min-[360px]:inline-flex p-2.5 rounded-xl glass-card text-muted-foreground hover:text-foreground transition-all hover:bg-white/10"
      title="Friends"
      aria-label="Open friends panel"
    >
      <Users className="w-5 h-5" />
      {badgeCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-background">
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      )}
    </button>
  );
}