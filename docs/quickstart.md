# Run Anima on your own machine

Get Anima running locally and meet your first agent — an AI teammate you can DM and @mention in
your own Slack. No coding required: a few terminal commands, then click through the rest in your
browser.

## Before you start

You'll need:

- **Node.js 20+, pnpm, and git**
- **A coding-agent CLI, installed and logged in** — Claude Code, Codex, or Kimi. This is what
  your agent runs on; you pick which one when you create the agent.
- **A Slack workspace you can install an app into** (a free test workspace works fine)

## 1. Get the code and build it

```bash
git clone https://github.com/totoday/anima.git
cd anima
pnpm install
pnpm build
```

`pnpm install` runs from the workspace root and installs both the server/runtime dependencies and
the web control panel dependencies.

## 2. Start Anima

```bash
pnpm services:start
```

This starts the agent runtime and the web control panel. New installs store config and state in
`~/.anima/` by default, so Anima keeps working no matter which project directory your terminal is
in. Open the control panel:
**<http://127.0.0.1:4174>**

## 3. Create your agent

In the control panel, fill in a **name** and a **role**, and click **Create**.

## 4. Connect it to Slack

The **Connect Slack** panel walks you through Slack app setup. You'll hop between the panel and
Slack's app site, pasting two tokens back into Anima:

1. **Create app** → pick your workspace → **Install**.
2. **Basic Information → App-Level Tokens** → generate one with scope `connections:write` → paste
   the `xapp-…` token into Anima.
3. **OAuth & Permissions → Install to Workspace** → paste the **Bot User OAuth Token** (`xoxb-…`).
   Anima connects automatically.
4. Assign an **Owner** from the member list. If **Notify the new owner now** is on, the agent DMs
   them to introduce itself.

Tokens are stored only in `~/.anima/`. The agent comes online automatically. If you left owner
notification on, it will **DM the owner in Slack** within a few seconds to introduce itself. 🎉

## Play with it

- Reply to its DM.
- Invite it to a channel (`/invite @your-agent`) and @mention it.
- Watch the **Activity** tab to see everything it does — every action is logged.

## Handy commands

```bash
pnpm services:status     # is it running?
pnpm services:restart    # restart the agent + web services
pnpm services:stop       # stop it
```

Logs: `~/.anima/logs/agent.log` and `~/.anima/logs/web.log`.

## Repo-local development home

The commands above use Anima's normal home resolution. In a fresh clone, that means `~/.anima/`.
If you are developing Anima itself and want an isolated repo-local home, use the explicit dev
scripts instead:

```bash
pnpm dev:services:start
pnpm dev:services:status
pnpm dev:services:restart
pnpm dev:services:stop
```

Those commands set `ANIMA_HOME=./.anima` on purpose.

## Troubleshooting

- **No DM from the agent?** Check that it shows as connected in the control panel.
- **No reply when you @ it in a channel?** Invite the bot first: `/invite @your-agent`.
- **Changed an existing agent's provider/model/role/tokens and nothing happened?** Restart to pick it
  up — a running agent doesn't hot-reload its config.
