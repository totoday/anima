# Anima Service Runbook

`animactl services <op>` supervises the agent and web daemons for one Anima home. The target is whichever environment is resolved from `ANIMA_HOME` or the default lookup (`./.anima` first, then `~/.anima`). In a fresh install, there is no repo-local `.anima`, so the normal home is `~/.anima`.

Anima itself does not name environments. If a team wants aliases for specific Anima homes, put that mapping in deployment scripts outside this repo and invoke `animactl` with the appropriate `ANIMA_HOME`.

The root `services:*` npm scripts use that normal resolver. For Anima source development, the
`dev:services:*` scripts explicitly set `ANIMA_HOME=./.anima` so local dev state stays inside the
repo clone.

Each Anima home runs two daemons:

- Agent (`animactl server`): Slack listener, reminder scheduler, and worker loop in one process.
- Web (`animactl web`): local status and activity views.

The web app port comes from the selected home config's `dashboardPort` field (default `4174`).
The agent service auto-starts newly runnable Slack-connected agents. Restart services after changing an already-running agent's provider, home, Slack tokens, or enabled state.

## Status

```bash
ANIMA_HOME=<path> node dist/server/cli/animactl.js services status
```

Status output includes each service id (`agent` / `web`), pid if running, web URL when relevant, and log path.

## Restart

```bash
pnpm build
ANIMA_HOME=<path> node dist/server/cli/animactl.js services restart
```

Full restarts are idle-gated by default. Before stopping the agent service, `animactl` waits for every agent inbox to have no `running` or `queued` items. If agents do not become idle before the timeout, the restart exits non-zero and prints the blocking agent/item ids instead of killing the service. Use `--idle-timeout-ms <ms>` to tune the wait for a deploy.

`--force` bypasses the idle gate and preserves the old stop/start behavior. Reserve it for an explicit operator decision during an incident; it can abort an active turn.

The supervisor stops the agent and web app, then starts them again with Anima runtime environment variables scrubbed from the child service environment.

Same-environment restart from inside an active runtime is refused, because it would kill the item making the request. Cross-environment restart is allowed when `ANIMA_HOME` points at another Anima home and `ANIMA_RUNTIME_HOME` still points at the caller's own home. A human can restart any environment from a fresh shell or the web restart button after the item finishes.

## Stop And Start

```bash
ANIMA_HOME=<path> node dist/server/cli/animactl.js services stop
ANIMA_HOME=<path> node dist/server/cli/animactl.js services start
```

`stop` is also refused from inside the same environment's active runtime, for the same reason.

## Logs

Logs live under the selected Anima home:

- `$ANIMA_HOME/logs/agent.log`
- `$ANIMA_HOME/logs/web.log`

Pid files live under `$ANIMA_HOME/run/{agent,web}.pid`.
