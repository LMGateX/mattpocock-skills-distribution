# Distribution

This fork is a thin, reproducible distribution of [mattpocock/skills](https://github.com/mattpocock/skills), pinned to an upstream release. It does not rewrite upstream skill bodies and it does not contain harness-specific runtime adaptations.

## Purpose

Upstream ships one promoted skill set per release, listed in `.claude-plugin/plugin.json`. A consumer such as a DSH profile, though, selects a **channel** by name, and that name has to keep resolving even when there is nothing being previewed. This fork is the layer that turns upstream's single promoted set into a small, stable channel set, and records enough provenance to prove which upstream release those channels describe.

It normally mirrors upstream rather than staging it: the pin is the commit an upstream release tag points at, and `.distribution/upstream.json` names that release under `upstreamRelease`. The field may be `null`, meaning the pin is deliberately ahead of every upstream release. What it may never be is a label that no longer points at the pinned commit, which both `update-upstream.mjs` and `verify-channels.mjs` reject.

Two channels are always published:

- **stable**: exactly the skill paths listed by upstream in `.claude-plugin/plugin.json` at the pinned commit.
- **beta**: `stable` plus every path listed in `.distribution/upstream.json` under `previewSkills`.

`previewSkills` is normally empty. While it is empty the two channels resolve to the **same set**: `beta` exists so that a profile which selected it keeps working, not because it currently leads. When upstream has something under `skills/in-progress/` worth shipping early, adding its path to `previewSkills` makes `beta` lead `stable` with no other change. When upstream promotes that skill, the generator refuses to run until the path is removed from `previewSkills`, so a graduation cannot be missed.

**The channel set is a public interface: a channel is added deliberately and never removed.** Consumers select channels by name, so dropping one breaks every consumer that selected it. `verify-channels.mjs` enforces both the closed set (`stable` + `beta`) and the `beta` ⊇ `stable` relationship.

The resolved channel manifests live under [`.distribution/channels/`](.distribution/channels). They are generated from upstream sources and verified rather than maintained by hand.

## Current upstream baseline

See [`.distribution/upstream.json`](.distribution/upstream.json) for the pinned upstream release, commit, commit date, and whole-tree content fingerprint.

The channel manifests describe the skill set at the **pinned commit**, which is the commit `upstreamRelease` points at. When `upstreamRelease` is `null` the pin is ahead of every upstream release, and the manifests describe an unreleased `main`.

The distribution version is independent of the upstream package version. A tag such as `v0.3.0` identifies this repository's own release; it does not claim that upstream published the same version. To find which upstream release a distribution release describes, read `upstreamRelease` at that tag.

## Verify

```bash
node .distribution/scripts/verify-channels.mjs
```

Verification is self-contained for a checked-out release tag and does not require an `upstream` remote. It checks that:

- `.distribution/channels/` contains exactly the generated channels, with no stale files;
- the closed channel set is `stable` + `beta`, and `beta` extends `stable`;
- `upstreamRelease` is `null` or a tag that points at the pinned commit;
- the stable channel exactly matches the included upstream Claude plugin manifest;
- the beta additions equal the declared `previewSkills`;
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
