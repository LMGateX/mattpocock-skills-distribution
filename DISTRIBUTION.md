# Distribution channels

This fork is a thin, reproducible distribution of [mattpocock/skills](https://github.com/mattpocock/skills). It does not rewrite upstream skill bodies and it does not contain harness-specific runtime adaptations.

## Purpose

Upstream intentionally keeps experimental skills under `skills/in-progress/`, outside its promoted plugin set. This fork exposes two explicit release channels while preserving the upstream layout:

- **stable**: exactly the skill paths listed by upstream in `.claude-plugin/plugin.json`.
- **beta**: the stable set plus the upstream `skills/in-progress/implement-spec` skill.

The resolved channel manifests live under `.distribution/channels/`. They are generated from upstream sources and verified rather than maintained by hand.

## Current upstream baseline

See [`.distribution/upstream.json`](.distribution/upstream.json) for the pinned upstream commit, commit date, whole-tree content fingerprint, and the provenance of `implement-spec`.

The distribution version is independent of the upstream package version. A tag such as `v0.1.0-beta.1` means "version 0.1.0 of this distribution's beta channel"; it does not claim that upstream published the same version.

## Verify

```bash
node .distribution/scripts/verify-channels.mjs
```

Verification is self-contained for a checked-out release tag and does not require an `upstream` remote. It checks that:

- the stable channel exactly matches the included upstream Claude plugin manifest;
- the beta channel is stable plus only `implement-spec`;
- every selected skill directory contains a matching `SKILL.md`;
- all upstream-owned files match the release's recorded content fingerprint;
- `implement-spec` matches its recorded fingerprint;
- when the pinned Git commit object is available, it is integrated into the release and has the same content.

## Sync upstream

Development checkouts use an `upstream` remote. Start with a clean working tree, then run:

```bash
bash .distribution/scripts/sync-upstream.sh
```

The script fetches `upstream/main` and prepares a no-commit merge. It then refreshes provenance and channel manifests and verifies the combined tree. If verification fails, the pending merge is aborted. If verification succeeds, upstream changes and refreshed metadata remain uncommitted for human review; the script never creates a commit or tag.

## Harness adapters

Harness integrations belong in separate downstream packages. In particular, the planned DSH plugin should consume a pinned tag from this repository and map DSH provider/invocation APIs without adding DSH tool names to upstream skill bodies.
