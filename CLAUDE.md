# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Anima is a local runtime that turns a code-agent runtime (Codex CLI or Claude Code) into a durable Slack teammate. One Slack bot maps to one **primary session** that spans every DM, channel, and thread — not one session per thread. See `docs/design.md` for the core model and `README.md` for the user-facing pitch.

## Commands

```bash
pnpm build           # rm -rf dist, tsc, build UI; produces dist/server and dist/web
pnpm build:server    # rebuild dist/server, dist/shared, and dist/tests only; skips Vite
pnpm typecheck       # tsc --noEmit, no UI
pnpm test            # default fast gate: server build + unit/api tests
pnpm test:fast:dist  # run the fast gate against an already-built dist
pnpm test:runtime    # heavier CLI/provider/service subprocess integration tests
pnpm test:all        # full build + every compiled test file
```

Run a single test (after `pnpm build:server`):

```bash
node --test dist/tests/runtime.test.js
node --test --test-name-pattern='primary session' dist/tests/runtime.test.js
```

Services. `animactl services` is an environment-neutral supervisor. Target an environment by setting `ANIMA_HOME`; the web app port comes from that environment's `config.json` `dashboardPort` (default 4174).

```bash
pnpm services:status
pnpm services:restart           # builds, then stops + starts agent + web app
pnpm services:stop
pnpm services:start
```

CLIs (`dist/server/cli/animactl.js` for environment control, `dist/server/cli/anima.js` is on the agent runtime's PATH):

```bash
node dist/server/cli/animactl.js server                 # Slack listener + reminder scheduler + worker loop (foreground)
node dist/server/cli/animactl.js web                    # local Anima web app (foreground)
node dist/server/cli/animactl.js services <op>          # supervisor: daemon server + web for one env (start|stop|restart|status)
```

Global flag on `animactl`: `--agent <id>` goes **before** the subcommand. The Anima home is resolved via `ANIMA_HOME` env var, then `./.anima` if present, then `~/.anima`. The Anima home holds config and state together (`config.json`, `agents/<id>/config.json`, `agents/<id>/inbox.json`, sessions, activities, reminders, subscriptions).

## Architecture

The repo is one TypeScript Node ESM project (`"type": "module"`, NodeNext, strict, `noUncheckedIndexedAccess`). Source under `server/`, tests under `tests/`, both compiled to `dist/`. The Vite/React web app is a separate package under `web/`.

### Event flow

```
Slack Socket Mode ──┐
                    ├──► InboxService ──► Runtime worker ──► Codex / Claude / Kimi CLI
Reminder scheduler ─┘                                                                 │
                                                                                   ▼
                                                                          anima CLI (Slack tools,
                                                                          reminders) → audited
                                                                          activities + Slack output
```

The Slack listener, reminder scheduler, and agent worker all run in one `agent` process per environment. The web app is a separate process so it stays available for inspection even if the agent is down.

### Key modules

- **`server/agents/`** — Agent config and lifecycle service. `agent.service.ts` owns create/patch/delete/list/status-facing config behavior; `agent-slack.service.ts` owns Slack connection/display info.
- **`server/inbox/`** — Inbox business layer and wake routing. Slack Socket Mode, Slack event normalization, subscription eligibility, reminder wake ingestion, and `InboxService` item lifecycle orchestration live here.
- **`server/storage/schema/inbox.store.ts`** — Inbox persistence store. It owns the inbox file schema plus direct single-store operations (`find`, `list`, `insertIfAbsent`, `replaceItem`, `claimQueued`, `complete`, `fail`, `requeue`, `requestStop`). It does not own cross-store business flow.
- **`server/storage/schema/activity.ts`** — Per-agent append-only activity store. Runtime events, provider tool rows, Slack tool rows, reminders, and subscription ops write through this path.
- **`server/slack/`** — Slack API/data helpers only. SDK client creation, shortcuts, pure Slack formatting helpers, and workspace directory/cache logic live here. Agent attention and inbox semantics belong in `inbox/`.
- **`server/tools/`** — Agent-facing `anima ...` command implementations: message/read/react/file/ask/subscription tool behavior and CLI registration.
- **`server/runtime/`** — Runtime item execution. `runtime-worker.ts` drains `InboxService`, handles active-run follow-ups, stop/idle/crash behavior, prompt construction, provider effects, session stats, and activity emission.
- **`server/providers/`** — Provider adapter layer. Claude Code, Codex CLI, and Kimi CLI adapters own only their CLI protocols; `child-process.ts` is the shared spawn layer.
- **`server/reminders/`** — Reminder records, repeat-rule parsing (`every:15m`, `daily@09:00`, `weekly:mon,fri@09:00`), reminder lifecycle/activity, and the `anima reminder` CLI. Due reminders become inbox items through `inbox/`.
- **`server/storage/`** — Persistence primitives and typed stores: JSON files, JSONL logs, file locks, safe filenames, and `storage/schema/*` store modules. Folder layout is under `$ANIMA_HOME/agents/<agentId>/`.
- **`server/services/`** — Environment-neutral daemon supervisor. `supervisor.ts` (start/stop/status with pid files, log files, `ps` orphan fallback, env scrub). Called by `cli/services-cli.ts` to back `animactl services <op>`.
- **`server/web/`** — Web API backend and static app host. Route modules parse HTTP input, call services, redact secrets, and return view data. UI package under `web/` builds to `dist/web/`.
- **`server/runtime/host.ts`** — The agent service host. It wires runnable agents, Slack subscribers, reminder subscribers, inbox services, runtime workers, and provider adapters into one foreground `agent` process.
- **`server/cli/anima.ts`** — Agent-facing CLI entry. Registers `anima message`, `anima ask`, `anima reminder`, `anima subscription`, `anima file`, and `anima reaction`.
- **`server/cli/animactl.ts`** — Operator CLI entry (`server`, `web`, `services`).

### Vocabulary (matches `docs/design.md`)

- **Agent** — durable Slack bot identity, defined in config.
- **Session** — long-lived primary working context (`agent:<agentId>:primary`). **Not** one-per-thread.
- **Slack context** — the DM, channel, or thread a Slack message came from.
- **Inbox item** — inbound Slack message, reminder wake, or user/system item queued for an agent.
- **Activity** — timestamped worker/tool entry for an agent.

### Layering

These modules form a layered flow; each owns one thing. New logic goes in the layer that already owns the relevant state. A PR that needs to touch two layers is a signal to stop and re-check the boundary.

Dependency direction (downstream depends on upstream; never the reverse):

```
cli/, web/                                       ← entry points
  ↓
web routes / CLI commands                          ← parse input and return view/CLI output
  ↓
domain services                                   ← business logic and cross-store orchestration
  ↓
storage/schema/* stores                           ← direct persistence for one table/file family
  ↓
storage primitives                                ← JSON/JSONL/files/locks
```

- **API/web/CLI layers** parse input, call a service, redact/shape output, and stop there. They should not read or write storage directly.
- **Service layers** own business semantics and multi-store operations. If a workflow touches config + inbox + activity, it belongs in a service, not a store or route.
- **Store layers** own one persisted table/file family. Methods should be direct persistence operations such as `find`, `list`, `insertIfAbsent`, `replaceItem`, `claimQueued`, `complete`, `delete`. Stores should not know HTTP, Slack routing, provider execution, or cross-store orchestration.
- **Storage primitives** (`JsonStore`, `JsonFile`, `JsonlLog`, locks) are generic mechanics. Domain code should use typed stores instead of ad hoc filesystem reads/writes.
- **`slack/`** owns speaking Slack — Web API calls, files, reactions, profiles, formatting. Nothing about agent attention or business logic.
- **`inbox/`** owns what the agent listens to and what work is queued — Slack Socket Mode, event normalization, eligibility rules, and `InboxService` lifecycle orchestration.
- **`runtime/`** owns provider CLI execution — the worker that drains the inbox service, prompt construction, provider event parsing, and same-session follow-up append.
- **`runtime/host.ts`** is the composition root that wires running agents.

Cross-cutting notes:
- **`defaultActivityStore`** (in `storage/schema/activity.ts`) is called by every write-side concern that produces audit entries — agent tools, runtime events, reminder ops. This is intentional; the audit log is a single channel.
- **Inbox item types** live in `shared/inbox.ts`; inbox persistence schema/store lives in `storage/schema/inbox.store.ts`; inbox business behavior lives in `inbox/inbox.service.ts`.
- Keep the store/service naming boundary explicit. `*.store.ts` is persistence; `*.service.ts` is business orchestration.

### Home memory

Anima bootstraps `MEMORY.md` and `notes/` in the agent home. Provider-native instruction files such as `AGENTS.md` or `CLAUDE.md` are optional user-managed extras; Anima does not create, link, or read them.

### Slack eligibility (current default)

DMs always wake. Channel top-level messages wake on @mention. Mentioning in a thread opens a 24h / 100-message subscription window; once involved, follow-ups wake without a re-mention. Top-level channel chatter without a mention is ignored. Slack ingestion lives in `server/inbox/`; routing rules live in `server/inbox/slack-subscriptions.ts`.

## Architecture & code quality

Keep design and code simple and direct. Bias toward fewer concepts, fewer files, fewer layers.

- **No defensive coding inside the system.** Trust internal callers and framework guarantees. Validate only at boundaries: user input, Slack/Web API responses, file reads, env vars.
- **No backwards-compatibility shims.** Delete dead code outright — no `_unused`, no `// removed`, no re-exports kept "just in case", no parallel old/new code paths. If the codebase isn't shipped to external consumers, just change it.
- **Minimal surface — start narrow, expand on demand.** When you spot a type field, config option, enum variant, function parameter, or code branch with zero writers OR zero readers, delete it; don't keep it "in case someone needs it later". When designing new code, start with the narrowest possible type/API and add fields only when a concrete consumer needs them. Speculative scaffolding rots; adding a field when there's a real reader is cheap.
- **Three duplications before an abstraction.** Two similar blocks is fine; extract on the third, and only within the same module. Don't design for hypothetical future callers.
- **Comments are for WHY, not WHAT.** Skip comments that restate the code. Write one only when the reason is non-obvious: a hidden constraint, a workaround, a surprising invariant.
- **Error handling only where action is possible.** Retry, degrade, or surface a useful message — otherwise let the exception bubble. Don't wrap-and-rethrow with no added information.
- **Service layer does not touch HTTP.** Response construction (`ServerResponse`, `writeHead`, `reply.send`) belongs in routes/CLI entrypoints. Services return data or throw; callers decide how to write to the wire.
- **Conditional properties: assign, don't spread.** `if (x) result.x = x` is clearer than `...(x && { x })`, and avoids type-inference headaches.
- **Test helpers stay out of business code.** If a factory/constructor has one business caller but many test callers, inline it into the business path and keep a test-only version under `tests/helpers/`.
- **No planning, analysis, or summary markdown files** unless explicitly asked. Work from conversation context.
- **No half-finished implementations.** If a feature isn't wired all the way through, don't leave a stub that pretends it is.

## Plan-first

Before non-trivial changes, propose the plan in chat (what you'll touch, why, the seams involved) and wait for explicit approval. Then edit. Read-only exploration (grep, read, run tests) doesn't need approval — looking is not acting.

## Repo conventions

- **Imports use `.js` suffixes** in TypeScript source (NodeNext ESM): `import { foo } from './bar.js'` even though the source is `bar.ts`.
- Tests live in `tests/*.test.ts` and run from `dist/tests/*.test.js` via the Node test runner (`node --test`). No Jest or Vitest in `server/`.
- The default `pnpm test` is intentionally the fast gate (`unit + api`) and skips the Vite build; use `pnpm test:runtime` for CLI/provider/service subprocess coverage, and `pnpm test:all` for the full local/CI-style sweep.
- The web package (`web/`) has its own `package.json` and Vite/React/ESLint config; do not mix it with the Node CLI.
- The `dist/` directory is committed-ignored output; `pnpm build` always rebuilds from scratch.

## Operating constraints (from project memory)

- Service control: never `kill` / `pkill` the agent or web app directly. Always go through `animactl services <op>`. The supervisor detects `ANIMA_INBOX_ITEM_ID` + `ANIMA_RUNTIME_HOME` and **refuses to stop or restart the agent's own environment** — that would kill the item making the request. Restarting a **different** environment from inside a runtime is allowed when `ANIMA_HOME` points at that other environment while `ANIMA_RUNTIME_HOME` still points at the caller's own environment. The web app also exposes `POST /api/services/restart` (button in sidebar) for browser-driven restarts, which a human can use to restart the agent's own environment after the item ends.
- Runtime config and state live under the selected `ANIMA_HOME` directory. Logs go to `$ANIMA_HOME/logs/{agent,web}.log`. Pid files go to `$ANIMA_HOME/run/{agent,web}.pid`.
