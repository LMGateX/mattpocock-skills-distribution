# Distribution metadata

This directory is the only distribution-owned overlay on top of upstream `mattpocock/skills`.

- `upstream.json` pins the upstream release and commit, the commit date, the whole-tree content fingerprint, when it was recorded, and the `previewSkills` that `beta` adds on top of `stable`. `upstreamRelease` is the tag pointing at the pin, or `null` when the pin is ahead of every release.
- `channels/stable.json` is the resolved promoted set from `.claude-plugin/plugin.json` at that commit.
- `channels/beta.json` is `stable` plus `previewSkills`, and declares `extends: stable`. It is always published, even when it currently resolves to the same set as `stable`.
- `scripts/channel-lib.mjs` holds the shared primitives: the closed channel set, the digest functions, and the `upstreamRelease` check.
- `scripts/update-upstream.mjs` records the current `upstream/main` as the pin, and refuses to run while `upstreamRelease` names a tag that does not point at it.
- `scripts/generate-channels.mjs` regenerates the channel manifests and removes channel files that are no longer generated.
- `scripts/verify-channels.mjs` enforces channel and upstream-content invariants.
- `scripts/sync-upstream.sh` updates the fork from `upstream/main` without publishing.

Do not edit generated channel manifests by hand. Do not put harness-specific behavior in this repository.
