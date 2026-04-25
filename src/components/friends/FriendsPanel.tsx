import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Copy, RefreshCw, Check, X, Trash2, Eye, EyeOff, Inbox, UserPlus, Users, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useFriends } from "@/hooks/useFriends";
import { CATEGORIES } from "@/lib/dashboard-data";
import { useUserProjects } from "@/hooks/useUserProjects";
import AddFriendInput from "./AddFriendInput";

interface FriendsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = "friends" | "requests" | "inbox";

export default function FriendsPanel({ open, onOpenChange }: FriendsPanelProps) {
  const { profile, regenerateFriendCode } = useUserProfile();
  const f = useFriends();
  const { projects, projectKey } = useUserProjects();
  const [tab, setTab] = useState<Tab>("friends");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const copyCode = () => {
    if (!profile) return;
    navigator.clipboard.writeText(profile.friend_code);
    toast.success("Code copied");
  };

  const acceptToCategory = async (
    suggestion: typeof f.incomingSuggestions[number],
    categoryId: string,
    targetLabel: string,
  ) => {
    // Add as a persistent mission to the chosen Home category
    const senderTag = suggestion.senderProfile?.username
      ? ` (from @${suggestion.senderProfile.username})`
      : "";
    const description = (suggestion.note || "").trim() + senderTag;
    window.dispatchEvent(new CustomEvent("lov:add-friend-mission", {
      detail: {
        categoryId,
        mission: {
          title: suggestion.title,
          description: description.slice(0, 240),
          duration: "—",
          xp: 10,
          persistent: true,
        },
      },
    }));
    await f.respondSuggestion(suggestion, true);
    setPickingFor(null);
    toast.success(`Added to ${targetLabel}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b border-white/5">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <Users className="w-5 h-5 text-primary" /> Friends
          </SheetTitle>
        </SheetHeader>

        {/* My code card */}
        {profile && (
          <div className="px-5 py-3 border-b border-white/5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Your code</p>
                <p className="text-lg font-bold text-foreground tracking-widest font-mono">{profile.friend_code}</p>
                <p className="text-xs text-muted-foreground truncate">@{profile.username}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={copyCode} title="Copy code" className="p-2 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all">
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={regenerateFriendCode} title="Generate new code" className="p-2 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
            <AddFriendInput onAdd={f.addFriend} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5">
          {([
            { id: "friends" as const, label: "Friends", count: f.accepted.length, icon: Users },
            { id: "requests" as const, label: "Requests", count: f.incomingRequests.length + f.outgoingRequests.length, icon: UserPlus },
            { id: "inbox" as const, label: "Inbox", count: f.incomingSuggestions.length, icon: Inbox },
          ]).map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  active ? "gradient-purple text-primary-foreground glow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-white/25" : "bg-muted/40"}`}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {f.loading && <p className="text-center text-xs text-muted-foreground py-8 animate-pulse">Loading…</p>}

          {!f.loading && tab === "friends" && (
            f.accepted.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">No friends yet. Share your code above.</p>
            ) : f.accepted.map(({ friendship, friend, iShareWithThem, theyShareWithMe }) => {
              const expanded = expandedId === friendship.id;
              return (
                <div key={friendship.id} className="rounded-xl bg-muted/20 border border-white/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expanded ? null : friendship.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-all text-left"
                  >
                    <span className="text-2xl">{friend.avatar_emoji || "🦊"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{friend.display_name || `@${friend.username}`}</p>
                      <p className="text-[10px] text-muted-foreground truncate">@{friend.username}</p>
                    </div>
                    {theyShareWithMe && <span title="Sharing with you" className="w-2 h-2 rounded-full bg-emerald-400" />}
                  </button>

                  {expanded && (
                    <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/5">
                      {/* My share toggle */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Share my stats with them</span>
                        <button
                          onClick={() => f.toggleMyShare(friendship, !iShareWithThem)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                            iShareWithThem ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          {iShareWithThem ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {iShareWithThem ? "On" : "Off"}
                        </button>
                      </div>

                      {/* Promises */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">🤝 Shared promises</p>
                        <div className="space-y-1.5">
                          {[0, 1, 2].map(i => (
                            <input
                              key={i}
                              defaultValue={friendship.promises[i] || ""}
                              onBlur={e => {
                                const next = [...friendship.promises];
                                next[i] = e.target.value;
                                if (next[i] !== friendship.promises[i]) f.updatePromises(friendship.id, next);
                              }}
                              placeholder={`Promise ${i + 1}…`}
                              maxLength={200}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-background/40 border border-white/5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/40"
                            />
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => { if (confirm(`Remove @${friend.username}?`)) f.unfriend(friendship.id); }}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-all"
                      >
                        <Trash2 className="w-3 h-3" /> Unfriend
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {!f.loading && tab === "requests" && (
            <div className="space-y-3">
              {f.incomingRequests.length === 0 && f.outgoingRequests.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">No pending requests.</p>
              )}
              {f.incomingRequests.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Incoming</p>
                  {f.incomingRequests.map(({ friendship, sender }) => (
                    <div key={friendship.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/20 border border-white/5">
                      <span className="text-xl">{sender?.avatar_emoji || "🦊"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{sender?.display_name || `@${sender?.username || "user"}`}</p>
                        <p className="text-[10px] text-muted-foreground truncate">@{sender?.username}</p>
                      </div>
                      <button onClick={() => f.acceptRequest(friendship.id)} className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-all" title="Accept">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => f.declineRequest(friendship.id)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all" title="Decline">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {f.outgoingRequests.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Sent</p>
                  {f.outgoingRequests.map(({ friendship, recipient }) => (
                    <div key={friendship.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/20 border border-white/5">
                      <span className="text-xl opacity-60">{recipient?.avatar_emoji || "🦊"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-muted-foreground truncate">@{recipient?.username || "user"}</p>
                        <p className="text-[10px] text-muted-foreground/70">Pending…</p>
                      </div>
                      <button onClick={() => f.cancelOutgoing(friendship.id)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all" title="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!f.loading && tab === "inbox" && (
            f.incomingSuggestions.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">No pending suggestions.</p>
            ) : f.incomingSuggestions.map(s => {
              const picking = pickingFor === s.id;
              return (
                <div key={s.id} className="p-3 rounded-xl bg-muted/20 border border-white/5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{s.senderProfile?.avatar_emoji || "🦊"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground">From @{s.senderProfile?.username || "friend"}</p>
                      <p className="text-sm font-bold text-foreground">{s.title}</p>
                    </div>
                  </div>
                  {s.note && <p className="text-xs text-muted-foreground italic">"{s.note}"</p>}

                  {!picking ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPickingFor(s.id)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-bold hover:bg-primary/30 transition-all"
                      >
                        Accept → pick pillar
                      </button>
                      <button
                        onClick={() => f.respondSuggestion(s, false)}
                        className="px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground text-xs font-semibold transition-all"
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Add as persistent task to…</p>
                        <button
                          onClick={() => setPickingFor(null)}
                          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                        >
                          <ChevronLeft className="w-3 h-3" /> Back
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat.id}
                            onClick={() => acceptToCategory(s, cat.id, cat.name)}
                            title={cat.name}
                            className="flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg bg-background/40 border border-white/5 hover:border-primary/40 hover:bg-primary/10 transition-all"
                          >
                            <span className="text-lg leading-none">{cat.icon}</span>
                            <span className="text-[9px] font-semibold text-foreground/80 truncate w-full text-center">{cat.name}</span>
                          </button>
                        ))}
                        {projects.map(p => (
                          <button
                            key={p.id}
                            onClick={() => acceptToCategory(s, projectKey(p.id), p.name)}
                            title={p.name}
                            className="flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg bg-background/40 border border-white/5 hover:border-primary/40 hover:bg-primary/10 transition-all"
                          >
                            <span className="text-lg leading-none">{p.emoji || "📁"}</span>
                            <span className="text-[9px] font-semibold text-foreground/80 truncate w-full text-center">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}