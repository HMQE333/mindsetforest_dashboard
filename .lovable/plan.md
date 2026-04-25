## Friends System & Shareable Stats Profile

A new social layer on top of MindsetForest. Users get a username + friend code, can add friends, share their Home/Stats with each friend (live) **or** mint a public profile URL (like Library shares), pin 3 free-text "shared promises" per friend, and push tasks as suggestions to a friend's Planning inbox.

A small **Friends icon** sits in the top-right header (next to Settings) and opens a slide-out side panel. It's hidden under ~640px (typical phone) — purely a desktop/tablet feature.

---

### Why this matters

Right now MindsetForest is a single-player RPG. Friends turn it into a co-op layer: accountability without nagging, ambient awareness of how the people you care about are doing, and a place to record "things we promised each other." It builds on the share infrastructure already proven by Library shares — same RPC pattern, same `/share/...` URL structure, same domain (`hmqe.org`).

---

### Concept

**1. Identity** — Each user picks a unique `@username` (3-20 chars, lowercased, alnum + underscore) and gets an auto-generated 6-char `friend_code` (e.g. `K7M2X9`). Both go in a new `user_profiles` table. The friend code is shown in the friends panel under "Add me" and can be regenerated.

**2. Discovery** — Add a friend by typing **either** their `@username` or their friend code. No email lookup, no public search index — keeps it intentional and private.

**3. Friendship** — A request is created (`pending`); the recipient sees it in a "Requests" tab with Accept/Decline. On accept, both sides get a friendship row. Either side can unfriend.

**4. Stats sharing** — Two complementary modes:
  - **Per-friend live sharing**: a toggle on each friend row. When ON, that friend's panel shows a "View their dashboard" preview (level, XP, streak, today's missions, weekly chart, top metrics). Real-time, no URL.
  - **Public profile link**: like Library shares — generate `/share/profile/<id>` on `hmqe.org`. Works for anyone (e.g. share to Twitter, embed in a portfolio). Owner picks which sections to include (Hero, Weekly Progress, Stats Overview, Activity Pulse, Achievements).

**5. Shared promises** — Three free-text fields per friend (e.g. "Send a book recommendation each month"). Stored on the friendship row, both sides can edit, both see the same text. Just reminders — no XP, no checkboxes (kept intentionally light per your answer).

**6. Friend-linked tasks** — From any Planning task or mission, a "Send to friend" action pushes a copy into the friend's **suggestion inbox** (a new section in the friends panel). The recipient sees title + your name + a note, then Accept (creates a real Planning task in their portfolio with a back-link to you) or Decline. Inspired by the existing Planning mention system.

---

### UI breakdown

#### A. Friends button — `src/pages/Index.tsx`

In the existing top-right header row (currently only the Settings cog), add a new **Friends** button to the **left of Settings**. Hidden via `hidden sm:inline-flex` (Tailwind `sm:` = 640px+) so phones never see it.

```
[ 👥 (badge: 2) ] [ ⚙ ]
```

A small red dot badge appears when there are pending requests or unread suggestions.

#### B. Friends side panel — new `src/components/friends/FriendsPanel.tsx`

A right-side slide-out using `Sheet` from shadcn (already in the codebase). Width ~380px, full height. Tabs at top:

```
[ Friends (5) ] [ Requests (2) ] [ Inbox (1) ]
```

**Friends tab**:
```
┌────────────────────────────────────┐
│ My code: K7M2X9    [Copy] [Reroll] │
│ ┌────────────────────────────────┐ │
│ │ Add by @username or code  [+]  │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ ● Adam     @adam_w        [⋯]      │
│   🔥 12-day streak · Lvl 8         │
│   [👁 Live sharing: ON]            │
│   [📋 View profile]  [✉ Send]      │
│   ┌─ 🤝 Promises ─────────────┐    │
│   │ 1. Run together every Sat │    │
│   │ 2. Book swap monthly      │    │
│   │ 3. ____________________   │    │
│   └──────────────────────────┘    │
└────────────────────────────────────┘
```

Each friend row is collapsible. Live-sharing preview (when ON, both directions agreed) shows their hero numbers + weekly bars inline — fetched via a new RPC.

**Requests tab**: incoming + outgoing pending requests. Accept/Decline/Cancel.

**Inbox tab**: task suggestions sent *to you*. Each row: sender name, task title, optional note, Accept (drops it into your default Planning project) / Decline.

#### C. Public profile share — `/share/profile/:id`

New route `src/pages/SharedProfile.tsx`. Mirrors `SharedLibrary.tsx`:
- Read-only, anonymous, fetched via `get_shared_profile(share_id)` RPC
- Shows the sections the owner selected when creating the share
- "Powered by Mindset Forest" footer + CTA to sign up
- Same styling as SharedLibrary (no theme override, fixed dark)

A new "Share my profile" button lives **inside the Friends panel header** (not on the dashboard itself, to keep dashboard clean). Opens `ShareProfileModal.tsx` — same UX as `ShareLibraryModal`: pick sections to include, name it, public/private toggle, copy URL/embed buttons, list of existing profile shares.

Sections selectable:
- ☑ Hero (level, XP, streak, today's missions count)
- ☑ Weekly progress chart
- ☐ Stats overview (Tracker totals)
- ☐ 12-month activity pulse
- ☐ Achievements
- ☐ Top metrics (today / 7d / all-time per metric)

#### D. "Send to friend" entry points

Two places:
1. **Planning side panel** (`PlanningNodeDetail.tsx`) — new "✉ Send to friend" button in the actions row. Opens a small picker: friend dropdown + optional note → sends.
2. **Mission row** (`MissionView.tsx`) — same button in the row's hover actions.

Sending is a single insert into `friend_suggestions`.

---

### Data model

**New tables** (migration):

```sql
-- 1. Public-ish profile (username, code, display name)
CREATE TABLE public.user_profiles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    citext UNIQUE NOT NULL,        -- @adam_w, lowercase, 3-20 chars
  friend_code text UNIQUE NOT NULL,          -- K7M2X9
  display_name text NOT NULL DEFAULT '',
  avatar_emoji text NOT NULL DEFAULT '🦊',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Friendships (one row per pair, lower uuid first)
CREATE TYPE friendship_status AS ENUM ('pending','accepted','blocked');
CREATE TABLE public.friendships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          friendship_status NOT NULL DEFAULT 'pending',
  promises        jsonb NOT NULL DEFAULT '["","",""]'::jsonb,  -- always length 3
  share_from_requester boolean NOT NULL DEFAULT false, -- requester shares stats with recipient
  share_from_recipient boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);

-- 3. Profile shares (public URLs, mirrors library_shares)
CREATE TABLE public.profile_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'My Profile',
  sections    jsonb NOT NULL DEFAULT '{"hero":true,"weekly":true,"stats":false,"pulse":false,"achievements":false,"metrics":false}'::jsonb,
  is_public   boolean NOT NULL DEFAULT true,
  view_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 4. Task suggestions (one user pushes a task to another)
CREATE TYPE suggestion_status AS ENUM ('pending','accepted','declined');
CREATE TABLE public.friend_suggestions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  note          text NOT NULL DEFAULT '',
  source        text NOT NULL DEFAULT 'planning',  -- 'planning' | 'mission'
  status        suggestion_status NOT NULL DEFAULT 'pending',
  resulting_task_id uuid,                          -- planning_tasks.id once accepted
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz
);
```

**RLS** — strict per-row, no recursion:
- `user_profiles`: SELECT to anyone (needed for friend lookup), UPDATE only own row, INSERT only own
- `friendships`: SELECT only if `auth.uid() IN (requester_id, recipient_id)`. INSERT requires `requester_id = auth.uid()`. UPDATE allowed for either party (status, promises, own share toggle).
- `profile_shares`: same shape as `library_shares` (owner CRUD + public can SELECT when `is_public = true`)
- `friend_suggestions`: SELECT/UPDATE only sender or recipient. INSERT requires sender = auth.uid() AND a friendship exists.

**Helper function** (security definer, avoids RLS recursion):
```sql
CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = _a AND recipient_id = _b) OR (requester_id = _b AND recipient_id = _a))
  )
$$;
```

**RPCs** (security definer):
- `add_friend_by_handle(handle text)` — accepts `@username` or 6-char code, validates self-add, returns the created friendship row or error
- `accept_friend_request(request_id uuid)` / `decline_friend_request(request_id uuid)`
- `get_friend_dashboard(friend_id uuid)` — returns hero stats + weekly history **only if** the friend has `share_from_X = true` for the caller. Pulls from `dashboard_state`, `daily_completions`, `tracker_entries`.
- `get_shared_profile(share_id uuid)` — anonymous, mirrors `get_shared_library`, returns sections per the share's `sections` jsonb. Increments `view_count`.
- `regenerate_friend_code()` — owner-only, regenerates a new 6-char code with collision retry (max 5 attempts).

---

### Hooks

**New**:
- `src/hooks/useUserProfile.ts` — load/create own profile (auto-create on first sign-in if missing), update display_name/emoji, regenerate friend code
- `src/hooks/useFriends.ts` — list friends + requests + inbox, add/accept/decline/unfriend, toggle live-share, edit promises, send suggestion, accept/decline suggestion. Uses Supabase realtime on `friendships` and `friend_suggestions` filtered by `auth.uid()` so the badge updates live.
- `src/hooks/useFriendDashboard.ts` — for one friend, calls `get_friend_dashboard` RPC (with access guard)
- `src/hooks/useProfileShares.ts` — same shape as `useLibraryShares`

**Modified**: none — existing dashboard/tracker hooks stay as-is.

---

### Files

**New**
- `supabase/migrations/<ts>_friends_system.sql` — all tables, enums, RLS policies, RPCs, helper function
- `src/hooks/useUserProfile.ts`
- `src/hooks/useFriends.ts`
- `src/hooks/useFriendDashboard.ts`
- `src/hooks/useProfileShares.ts`
- `src/components/friends/FriendsButton.tsx` — header button + badge
- `src/components/friends/FriendsPanel.tsx` — side panel with 3 tabs
- `src/components/friends/FriendRow.tsx` — collapsible row with promises + live preview
- `src/components/friends/FriendDashboardPreview.tsx` — embedded mini dashboard (level/XP/streak/weekly bars)
- `src/components/friends/AddFriendInput.tsx` — handle/code input with validation
- `src/components/friends/RequestRow.tsx` — accept/decline UI
- `src/components/friends/SuggestionInbox.tsx` — incoming task suggestions
- `src/components/friends/SendToFriendModal.tsx` — friend picker + note for "send task" actions
- `src/components/friends/ShareProfileModal.tsx` — mirrors ShareLibraryModal, picks sections
- `src/components/friends/ProfileSetupModal.tsx` — first-time username picker (shown when no profile row exists)
- `src/pages/SharedProfile.tsx` — public profile route

**Modified**
- `src/App.tsx` — add `<Route path="/share/profile/:shareId" element={<SharedProfile />} />`
- `src/pages/Index.tsx` — render `<FriendsButton />` next to Settings, mount `<FriendsPanel />`, mount `<ProfileSetupModal />` when needed
- `src/components/planning/PlanningNodeDetail.tsx` — add "✉ Send to friend" button → opens `SendToFriendModal`
- `src/components/dashboard/MissionView.tsx` — same button in mission row actions

---

### Edge cases handled

- **Self-add** — `add_friend_by_handle` rejects when target == caller
- **Duplicate request** — uniqueness on `(requester, recipient)` returns a friendly toast instead of a hard error
- **Reverse-direction request already pending** — auto-accepts both sides (you sent to A, A sent to you → instant friendship)
- **Username collision** — `citext UNIQUE` plus client-side debounced availability check during profile setup
- **Friend-code collision** — generator uses 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (≈30^6 ≈ 730M, no 0/O/1/I confusion); retry up to 5 times on insert
- **Friend deleted account** — `ON DELETE CASCADE` removes friendship rows; UI gracefully filters orphaned suggestions
- **Live-share OFF, friend tries to view** — `get_friend_dashboard` returns `{error:"private"}`; UI shows "This friend hasn't enabled sharing with you" with a "Request sharing" button (sends a one-shot notification — out of scope for v1, just a toast for now)
- **Public profile owner deletes account** — share row cascade-deletes; visiting URL shows the same "Share not available" page used by SharedLibrary
- **Suggestion accepted twice** — `status` enum prevents re-accepting; UI hides Accept button after status changes
- **Mobile (<640px)** — Friends button and panel are completely hidden via `hidden sm:flex`. Existing mobile users see no change.
- **Realtime spam** — channel subscriptions filtered server-side by `auth.uid()` so users only get their own row updates

---

### Out of scope for this iteration

- Direct messaging / chat
- Notifications outside the panel (no email, no push)
- Group friends / clans / leaderboards
- Reactions or comments on a friend's stats
- Activity feed ("Adam completed 5 missions today")
- Promise streaks / scoring
- Co-owned tasks (real-time sync between two users on one task) — we deliberately chose "send-as-suggestion" instead
- Mobile UI for friends panel
- Friend search / discovery beyond exact handle match
- Profile share themes (uses default dark theme like SharedLibrary)
