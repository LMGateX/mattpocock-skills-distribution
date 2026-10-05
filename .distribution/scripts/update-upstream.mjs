import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertUpstreamRelease, commitContentDigest, readJson, renderJson, root, workingContentDigest } from './channel-lib.mjs'

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

const upstream = await readJson('.distribution/upstream.json')
const commit = git('rev-parse', 'upstream/main')
const commitDate = git('show', '-s', '--format=%cI', commit)
const expectedContentSha256 = commitContentDigest(commit)
const workingContentSha256 = workingContentDigest()

if (workingContentSha256 !== expectedContentSha256) {
  throw new Error('Working upstream-owned content does not match upstream/main; refusing to record provenance')
}

const previousRelease = upstream.upstreamRelease
const changed =
  upstream.commit !== commit ||
  upstream.commitDate !== commitDate ||
  upstream.upstreamContentSha256 !== expectedContentSha256

upstream.commit = commit
upstream.commitDate = commitDate
upstream.upstreamContentSha256 = expectedContentSha256
assertUpstreamRelease(upstream)

if (changed || previousRelease !== upstream.upstreamRelease) {
  upstream.recordedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

await writeFile(join(root, '.distribution/upstream.json'), renderJson(upstream))
console.log(
  (changed ? 'recorded' : 'already current at') + ' upstream/main ' + commit +
  ' (' + (upstream.upstreamRelease ?? 'ahead of every release') + ')'
)
