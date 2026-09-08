#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to sync: working tree is not clean." >&2
  exit 1
fi

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "Missing upstream remote." >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [ -z "$current_branch" ]; then
  echo "Refusing to sync from detached HEAD." >&2
  exit 1
fi

abort_pending_merge() {
  status=$?
  if [ "$status" -ne 0 ] && git rev-parse --verify MERGE_HEAD >/dev/null 2>&1; then
    git merge --abort
    echo "Sync failed; the pending upstream merge was aborted." >&2
  fi
  exit "$status"
}
trap abort_pending_merge EXIT

git fetch upstream main
target="$(git rev-parse upstream/main)"
if git merge-base --is-ancestor "$target" HEAD; then
  echo "Already contains upstream/main $target."
else
  git merge --no-commit --no-ff "$target"
fi

node .distribution/scripts/update-upstream.mjs
node .distribution/scripts/generate-channels.mjs
node .distribution/scripts/verify-channels.mjs

trap - EXIT
if git rev-parse --verify MERGE_HEAD >/dev/null 2>&1; then
  echo "Upstream sync verified and left uncommitted for review. Commit the pending merge when ready."
elif git diff --quiet -- .distribution; then
  echo "Upstream sync verified; distribution metadata was already current."
else
  echo "Upstream sync verified. Review and commit the metadata changes."
fi
