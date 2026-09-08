# Distribution metadata

This directory is the only distribution-owned overlay on top of upstream `mattpocock/skills`.

- `upstream.json` pins provenance and the selected upstream beta skill.
- `channels/stable.json` is the resolved promoted set from `.claude-plugin/plugin.json`.
- `channels/beta.json` is the stable set plus official upstream `implement-spec`.
- `scripts/generate-channels.mjs` regenerates the channel manifests.
- `scripts/verify-channels.mjs` enforces channel and upstream-content invariants.
- `scripts/sync-upstream.sh` updates the fork from `upstream/main` without publishing.

Do not edit generated channel manifests by hand. Do not put harness-specific behavior in this repository.
