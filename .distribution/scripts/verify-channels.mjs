import { execFileSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  buildChannelManifests,
  commitContentDigest,
  readJson,
  root,
  skillNameFromMarkdown,
  workingContentDigest
} from './channel-lib.mjs'

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function gitSucceeds(...args) {
  try {
    git(...args)
    return true
  } catch {
    return false
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const expected = await buildChannelManifests()
const stablePath = join(root, '.distribution/channels/stable.json')
const betaPath = join(root, '.distribution/channels/beta.json')
const [stableText, betaText] = await Promise.all([
  readFile(stablePath, 'utf8'),
  readFile(betaPath, 'utf8')
])

const stable = JSON.parse(stableText)
const beta = JSON.parse(betaText)
assert(JSON.stringify(stable) === JSON.stringify(expected.stable), 'stable.json is stale; run generate-channels.mjs')
assert(JSON.stringify(beta) === JSON.stringify(expected.beta), 'beta.json is stale; run generate-channels.mjs')
const stableSet = new Set(stable.skills)
const betaSet = new Set(beta.skills)
assert(stableSet.size === stable.skills.length, 'stable channel contains duplicate paths')
assert(betaSet.size === beta.skills.length, 'beta channel contains duplicate paths')
assert(beta.skills.length === stable.skills.length + 1, 'beta must contain exactly one skill beyond stable')
for (const skillPath of stable.skills) assert(betaSet.has(skillPath), 'beta is missing stable skill ' + skillPath)
assert(beta.additionalSkills.length === 1, 'beta must declare exactly one additional skill')
assert(beta.additionalSkills[0] === './skills/in-progress/implement-spec', 'beta addition must be official implement-spec')
assert(!stableSet.has(beta.additionalSkills[0]), 'implement-spec must not leak into stable before upstream promotion')

for (const skillPath of beta.skills) {
  const directory = join(root, skillPath.replace(/^\.\//, ''))
  assert((await stat(directory)).isDirectory(), 'skill directory is missing: ' + skillPath)
  const markdown = await readFile(join(directory, 'SKILL.md'), 'utf8')
  const declaredName = skillNameFromMarkdown(markdown)
  assert(declaredName === basename(directory), skillPath + ' declares name ' + declaredName)
}

const upstream = await readJson('.distribution/upstream.json')
const localContentSha256 = workingContentDigest()
assert(
  localContentSha256 === upstream.upstreamContentSha256,
  'upstream-owned content differs from the recorded release fingerprint'
)

const implementPath = upstream.betaSkills['implement-spec'].path.replace(/^\.\//, '') + '/SKILL.md'
const localImplementBlob = git('hash-object', '--path=' + implementPath, implementPath)
assert(localImplementBlob === upstream.betaSkills['implement-spec'].skillGitBlob, 'implement-spec fingerprint is stale')

const commitIsAvailable = gitSucceeds('cat-file', '-e', upstream.commit + '^{commit}')
if (commitIsAvailable) {
  assert(
    commitContentDigest(upstream.commit) === upstream.upstreamContentSha256,
    'recorded upstream commit does not match the recorded content fingerprint'
  )
  const mergedIntoHead = gitSucceeds('merge-base', '--is-ancestor', upstream.commit, 'HEAD')
  const mergeHeadAvailable = gitSucceeds('rev-parse', '--verify', 'MERGE_HEAD')
  const mergedIntoPendingMerge = mergeHeadAvailable && gitSucceeds('merge-base', '--is-ancestor', upstream.commit, 'MERGE_HEAD')
  assert(mergedIntoHead || mergedIntoPendingMerge, 'recorded upstream commit is not integrated into this release')

  const recordedImplementBlob = git('rev-parse', upstream.commit + ':' + implementPath)
  assert(recordedImplementBlob === upstream.betaSkills['implement-spec'].skillGitBlob, 'recorded implement-spec blob is stale')
} else {
  console.log('INFO: recorded upstream commit object is unavailable; verified release fingerprints instead')
}

const isDistributionPath = (path) => path === 'DISTRIBUTION.md' || path.startsWith('.distribution/')
const unstaged = git('diff', '--name-only', '--').split(/\r?\n/).filter(Boolean)
const disallowedUnstaged = unstaged.filter((path) => !isDistributionPath(path))
assert(disallowedUnstaged.length === 0, 'unstaged upstream-owned changes: ' + disallowedUnstaged.join(', '))

const untracked = git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(Boolean)
const disallowedUntracked = untracked.filter((path) => !isDistributionPath(path))
assert(disallowedUntracked.length === 0, 'unexpected untracked upstream paths: ' + disallowedUntracked.join(', '))

console.log('OK: stable=' + stable.skills.length + ', beta=' + beta.skills.length)
console.log('OK: beta adds only official upstream implement-spec')
console.log('OK: upstream content fingerprint matches ' + upstream.commit)
