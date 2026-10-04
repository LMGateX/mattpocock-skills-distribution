# Distribution

This fork is a thin, reproducible distribution of [mattpocock/skills](https://github.com/mattpocock/skills). It does not rewrite upstream skill bodies and it does not contain harness-specific runtime adaptations.

## Purpose

Upstream promotes skills through `.claude-plugin/plugin.json`, but the promoted set only becomes consumable when upstream cuts a release. This fork exists so that a consumer can pin a commit that is already on upstream's `main` but not yet released, and resolve the promoted skill set from it reproducibly.

- **stable**: exactly the skill paths listed by upstream in `.claude-plugin/plugin.json` at the pinned commit.

There is one channel. An earlier **beta** channel existed only to carry `skills/in-progress/implement-spec` ahead of upstream. Upstream v1.3 graduated `implement-spec`, `pr`, and `retro` into the promoted set and removed `resolving-merge-conflicts`, so the preview had nothing left to preview and the channel was dropped. A future preview is a deliberate new decision, not a permanent second track.

The resolved channel manifest lives under [`.distribution/channels/`](.distribution/channels). It is generated from upstream sources and verified rather than maintained by hand.

## Current upstream baseline

See [`.distribution/upstream.json`](.distribution/upstream.json) for the pinned upstream commit, commit date, and whole-tree content fingerprint.

The pin may be ahead of the newest upstream release. v1.3 was merged to upstream `main`, but its version bump is still pending on upstream's release branch, so `.claude-plugin/plugin.json` at the pinned commit still reads `1.2.3`. The channel manifest describes the skill set at the pinned commit, not at the newest upstream tag.

The distribution version is independent of the upstream package version. A tag such as `v0.2.0` identifies this repository's own release; it does not claim that upstream published the same version.

## Verify

```bash
node .distribution/scripts/verify-channels.mjs
```

Verification is self-contained for a checked-out release tag and does not require an `upstream` remote. It checks that:

- `.distribution/channels/` contains exactly the generated channels, with no stale files;
- the stable channel exactly matches the included upstream Claude plugin manifest;
- every selected skill directory contains a `SKILL.md` whose declared name matches the directory;
- all upstream-owned files match the release's recorded content fingerprint;
- when the pinned Git commit object is available, it is integrated into the release and has the same content.

## Sync upstream

Development checkouts use an `upstream` remote. Start with a clean working tree, then run:

```bash
bash .distribution/scripts/sync-upstream.sh
```

The script fetches `upstream/main` and prepares a no-commit merge. It then refreshes provenance and the channel manifests and verifies the combined tree. If verification fails, the pending merge is aborted. If verification succeeds, upstream changes and refreshed metadata remain uncommitted for human review; the script never creates a commit or tag.

## Harness adapters

Harness integrations belong in separate downstream packages. In particular, the DSH plugin consumes a pinned tag from this repository and maps DSH provider/invocation APIs without adding DSH tool names to upstream skill bodies.
