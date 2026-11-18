# Learning system

One folder. A personal teacher that any MCP-capable AI (Claude Desktop, Claude Code) can use:

- **vault/**: your knowledge as Markdown (open it in Obsidian)
  - `Me/Known.md`: what you already understand (the anchors new things are explained through)
  - `Me/Philosophy.md`: how you think
  - `Me/Profile.md`: how you learn (start with school; the log refines it)
  - `Me/Teacher.md`: how the AI should teach you (edit freely)
  - `Styles/*.md`: learning styles (80/20 overview, step by step, problems first, zoom); add your own
  - `Tools/*.html`: board tools (ABCD quiz, flashcards); the AI can make and save new ones
  - `Subjects/<subject>/map.md`: one map per subject (core ideas, what each needs)
  - `Knowledge/`: notes, book notes, anything you want searchable
  - `system.json`: the folders and rules every session starts from
- **data/log.jsonl**: every learning event (date, subject, idea, style, tool, result, minutes, note)
- **server/mcp.mjs**: the MCP server and the teaching board (http://localhost:4319). No dependencies.
- **board/index.html**: the board page; tools run in a sandbox and report results back

## Setup on a new computer (about 2 minutes)

1. Install [Node.js](https://nodejs.org) 18 or newer (skip if `node --version` works).
2. Copy this folder anywhere, then in it: `node install.mjs`
3. Restart Claude Desktop. Ask: *"Use the learning system: teach me X."*

Optional: open `vault/` in Obsidian. Move the folder? Run `node install.mjs` again.

## How a session goes

1. The AI calls `me()`: rules, your profile, your anchors, styles, tools.
2. `history()` shows what you learned and what is due for a check (3/7/30 days).
3. `map(subject)`: reads or writes the subject's map; order = what's needed first, then what unlocks most.
4. You pick a style (or it suggests one); it teaches through your anchors, puts tests/models on the board with `show()`.
5. Board results come back via `results()`; every exercise is `log()`ged.
6. `end_session()` writes a summary to `vault/Sessions.md`.

Over time, ask: *"Read my history and propose changes to Profile.md"*: which styles and tools actually stick for you.

## Tools (MCP)

`me` · `search` · `read` · `styles` · `style` · `map` · `show` · `results` · `log` · `history` · `add_known` · `save_note` · `save_tool` · `save_style` · `end_session`

Writes stay inside `vault/` and `data/`. `log` only accepts known styles and a fixed set of results. `add_known` requires the learner's confirmation.
