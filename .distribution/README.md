# Distribution metadata

This directory is the only distribution-owned overlay on top of upstream `mattpocock/skills`.

- `upstream.json` pins the upstream commit, its date, its whole-tree content fingerprint, and when it was recorded.
- `channels/stable.json` is the resolved promoted set from `.claude-plugin/plugin.json` at that commit.
- `scripts/generate-channels.mjs` regenerates the channel manifests and removes channel files that are no longer generated.
- `scripts/verify-channels.mjs` enforces channel and upstream-content invariants.
- `scripts/sync-upstream.sh` updates the fork from `upstream/main` without publishing.

Do not edit generated channel manifests by hand. Do not put harness-specific behavior in this repository.
