# Release Process

This document defines how changes move from development to public releases once Anima is published
as an npm package.

## Branch Policy

`main` is protected. Do not push directly to it.

Required branch protection:

- Pull requests are required before merge.
- Required checks must pass before merge.
- At least one review is required.
- Force pushes to `main` are disabled.
- Deleting `main` is disabled.

Emergency fixes should still go through a small pull request. The process can be fast, but the
merge point stays reviewable and reproducible.

## Version Channels

Anima uses npm versions plus npm dist-tags to separate dogfood builds from stable releases.

| Channel | npm dist-tag | Example version | Who should use it |
| --- | --- | --- | --- |
| Canary | `canary` | `0.2.0-canary.20260529.36fa5d8` | Anima's own dogfood/staging installs |
| Stable | `latest` | `0.1.3` | External users and default installs |

Optional later channels:

- `next`: beta or release-candidate builds that are less volatile than canary but not yet stable.
- Release branches such as `release/0.1`: only when we need to maintain an older stable line while
  `main` continues toward a larger release.

Do not publish external users onto `canary` by default. Canary is for running real Anima team usage
against the latest `main` snapshot.

## Normal Flow

1. Open a pull request.
2. Review and pass required checks.
3. Merge to `main`.
4. CI publishes an immutable canary package for that commit and updates the `canary` dist-tag.
5. Anima dogfood/staging upgrades to that canary and runs it with real usage.
6. Once the canary has behaved well enough, tag a stable release from the same dogfooded commit.
7. CI publishes that tag as a normal semver version and updates the `latest` dist-tag.

Stable releases should be cut from a commit that already ran in dogfood. Early on, do this directly
from `main` by tagging the chosen commit:

```bash
git checkout main
git pull --ff-only
git tag v0.1.3 <dogfooded-commit-sha>
git push origin v0.1.3
```

The release workflow should build and publish the package from the tag, not from a mutable branch
name.

## Version Rules

While Anima is pre-1.0:

- Patch version (`0.1.2` -> `0.1.3`): bug fixes, polish, docs, small compatible behavior changes.
- Minor version (`0.1.x` -> `0.2.0`): larger user-visible features or storage/runtime changes.
- Canary version: any merge to `main` that should be dogfooded before stable.

Canary versions are immutable. Never republish the same canary version with different contents.

## Publish Safety

Before publishing a stable release:

- Run the full release checks.
- Confirm the package contents with `npm pack --dry-run`.
- Confirm no local private data, credentials, `.anima/` homes, or personal paths are included.
- Confirm the package version and git tag match.

The npm package should contain built artifacts (`dist/server`, `dist/shared`, `dist/web`) so users
do not need to build Anima to run it.

