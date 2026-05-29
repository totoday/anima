# Agent Usage: Native Kimi CLI Auth Detection

This note is written as a PR-ready map for Raycast's `agent-usage` extension.

## Current Behavior

`extensions/agent-usage/src/kimi/fetcher.ts` can fetch Kimi usage from:

- a manual Raycast preference token, or
- OpenCode auth at `~/.local/share/opencode/auth.json`, key `kimi-for-coding`.

That means users who log in through native `kimi-cli` can see `Not Configured` in Agent Usage even though `kimi /usage` works locally.

## Native Kimi CLI Shape

Native `kimi-cli` stores its config and OAuth token under `KIMI_SHARE_DIR` or `~/.kimi`:

- config: `~/.kimi/config.toml`
- OAuth credentials: `~/.kimi/credentials/kimi-code.json`

The OAuth credential key is `oauth/kimi-code`; the file name is derived by removing the `oauth/` prefix, so the on-disk file is `kimi-code.json`.

The file contains JSON with fields like:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": 1770000000,
  "scope": "...",
  "token_type": "Bearer"
}
```

The usage endpoint is the same endpoint already used by native Kimi CLI:

```text
GET https://api.kimi.com/coding/v1/usages
Authorization: Bearer <access_token>
Accept: application/json
```

The response includes a top-level quota plus shorter windows:

```json
{
  "usage": { "limit": 100, "used": 1, "remaining": 99, "resetTime": "..." },
  "limits": [
    {
      "window": { "duration": 5, "timeUnit": "TIME_UNIT_HOUR" },
      "detail": { "limit": 100, "used": 1, "remaining": 99, "resetTime": "..." }
    }
  ]
}
```

## Proposed Extension Change

In `src/kimi/fetcher.ts`, update token resolution to try native Kimi CLI before reporting `Not Configured`:

1. Keep manual Raycast token first.
2. Keep OpenCode `kimi-for-coding` detection.
3. Add native Kimi CLI fallback:
   - Resolve share dir from `KIMI_SHARE_DIR` when set, otherwise `~/.kimi`.
   - Read `<shareDir>/credentials/kimi-code.json`.
   - Use `access_token` as the bearer token.
4. If the token is expired and `refresh_token` is present, either:
   - initially return a clear expired-token error and ask the user to run `kimi login`, or
   - mirror native `kimi-cli` refresh behavior in a follow-up.

This change is narrowly scoped: it does not alter the Kimi usage parser or endpoint, only credential discovery.

## Why This Matters

Agent Usage currently supports Kimi for OpenCode users, but misses native `kimi-cli` users. Native `kimi-cli` is the path Anima uses, and it already exposes true remaining quota through `https://api.kimi.com/coding/v1/usages`.
