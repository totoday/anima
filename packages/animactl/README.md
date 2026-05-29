# @totoday/animactl

Operator CLI for installing and running Anima from npm.

```bash
npx @totoday/animactl start
npx @totoday/animactl@canary restart
npx @totoday/animactl status
npx @totoday/animactl stop
```

This package installs the `@totoday/animactl` runtime into `~/.anima/runtime/current` and runs
services from that pinned runtime. Durable Anima data remains in `~/.anima`.
