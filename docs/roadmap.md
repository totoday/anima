# Roadmap

Where Anima's product direction lives — what shipped recently, what's near-term,
and the larger bets we've decided to make but haven't started. This is a living
document — items move up as they're picked up and out as they ship.

> Detailed specs for in-flight work live as PRDs in the team Knowledge Base
> (`prds/`); this page is the high-level map.

## Recently shipped

- **Onboarding v2** — empty state → create agent (Name + Role) → guided Slack
  connect, no hand-edited config.
- **Connect → auto-start** — a freshly connected agent comes online with zero
  manual restart (runtime reconciler).
- **Team Knowledge Base auto-registers** on first agent create — the shared
  knowledge shows up at the aha moment, not an empty sidebar.
- **`role` rename** end-to-end (storage → API → UI → prompt) with back-compat.
- **Docs** — README, design, and a from-zero quickstart rewritten around the
  team-to-team, data-stays-yours positioning.
- **Slack connect v1 — trustworthy two-token flow.** Each token validated against
  Slack on paste, precise errors, and a "Connected to *[workspace]* as *[bot]*"
  success card so the roughest part of setup gives clear feedback.
- **Live config reload for running agents.** Changing a running agent's model,
  home, or tokens now takes effect without a restart — editing an agent is
  seamless.

## Near-term

- **Interactive input in Slack.** *In build.* Let an agent ask a question with
  clickable options (Block Kit buttons / single-select) instead of forcing a
  typed reply — a click wakes the agent with the chosen value, and typing still
  works as a fallback. Spec locked in `prds/interactive-ask.md`.
- **Effortless Slack connect — one-click OAuth.** With v1 (the trustworthy
  two-token flow) shipped, the remaining step: for any deployment with a stable
  public URL (`ANIMA_PUBLIC_URL` — a server domain *or* a stable local tunnel),
  collapse setup to a single "Add to Slack" OAuth click, no app-level token to
  copy. Auto-selected by whether that URL is present — Socket Mode stays the
  default when it isn't, so laptops are unaffected. This is a real dual-transport
  refactor (Events API ingestion + signature verification + OAuth callback);
  feasibility and UX both researched and confirmed. The deepest form, for an
  operator running many agents: a Slack app *configuration token* pasted once at
  setup lets us auto-create each agent's Slack app (`apps.manifest.create`) with
  the public URL templated in — so after one-time setup, adding an agent is
  effectively one click, no manual app creation at all.

## Planned

- **Knowledge-Base-aware agents.** *Needs a design discussion before we commit —
  it's a bigger change than it looks.* Today agents maintain their own memory but
  don't yet read from or contribute to the *shared* team knowledge as a conscious
  act — so the "agents author the shared knowledge" half of our model is still
  empty. The direction: give agents a mental model of the team KB (their home is
  a private partition; team-level knowledge lives at the root), the habit of
  consulting it when relevant, and a convention for writing durable, general
  knowledge to the shared layer. Prompt + convention first, minimal mechanism.
  This is the moat we lead with — high-leverage, which is exactly why we want the
  shape right before shipping it.
- **Knowledge Base, phase 2.** Findability and hygiene as the KB grows — a
  root-level index/map, light schema conventions, and cross-agent consistency
  checks.
