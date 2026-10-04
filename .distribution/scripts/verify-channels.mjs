import { execFileSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  buildChannelManifests,
  commitContentDigest,
  readJson,
  renderJson,
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
const channelDirectory = join(root, '.distribution/channels')

const expectedNames = Object.keys(expected).map((channel) => channel + '.json').sort()
const presentNames = (await readdir(channelDirectory)).filter((name) => name.endsWith('.json')).sort()
assert(
  JSON.stringify(presentNames) === JSON.stringify(expectedNames),
  'channel directory does not contain exactly the generated channels; found ' + presentNames.join(', ')
)

const channels = {}
for (const [channel, manifest] of Object.entries(expected)) {
  const text = await readFile(join(channelDirectory, channel + '.json'), 'utf8')
  assert(text === renderJson(manifest), channel + '.json is stale; run generate-channels.mjs')
  channels[channel] = JSON.parse(text)
}

for (const [channel, manifest] of Object.entries(channels)) {
  const skillSet = new Set(manifest.skills)
  assert(skillSet.size === manifest.skills.length, channel + ' channel contains duplicate paths')
  for (const skillPath of manifest.skills) {
    const directory = join(root, skillPath.replace(/^\.\//, ''))
    assert((await stat(directory)).isDirectory(), 'skill directory is missing: ' + skillPath)
    const markdown = await readFile(join(directory, 'SKILL.md'), 'utf8')
    const declaredName = skillNameFromMarkdown(markdown)
    assert(declaredName === basename(directory), skillPath + ' declares name ' + declaredName)
  }
}

const upstream = await readJson('.distribution/upstream.json')
const localContentSha256 = workingContentDigest()
assert(
  localContentSha256 === upstream.upstreamContentSha256,
  'upstream-owned content differs from the recorded release fingerprint'
)

// The channel set is a public interface: every channel this distribution has ever
// published must keep existing, because profiles select them by name. beta always
// extends stable; when nothing is previewed the two resolve to the same set.
for (const channel of ['stable', 'beta']) {
  assert(Object.hasOwn(channels, channel), 'the closed channel set must always declare ' + channel)
}
assert(
  Object.keys(channels).length === 2,
  'unexpected channel declared; add it to the closed set deliberately: ' + Object.keys(channels).join(', ')
)
assert(channels.stable.extends === undefined, 'stable must not extend another channel')
assert(channels.beta.extends === 'stable', 'beta must extend stable')

const stableSet = new Set(channels.stable.skills)
const betaSet = new Set(channels.beta.skills)
for (const skillPath of channels.stable.skills) assert(betaSet.has(skillPath), 'beta is missing stable Skill ' + skillPath)

const actualAdditional = channels.beta.skills.filter((skillPath) => !stableSet.has(skillPath)).sort()
const declaredAdditional = [...channels.beta.additionalSkills].sort()
assert(
  JSON.stringify(actualAdditional) === JSON.stringify(declaredAdditional),
  'beta additionalSkills does not match beta minus stable'
)
const previewSkills = [...upstream.previewSkills].sort()
assert(
  JSON.stringify(actualAdditional) === JSON.stringify(previewSkills),
  'beta additions differ from the previewSkills declared in .distribution/upstream.json'
)

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

console.log('OK: ' + Object.entries(channels).map(([channel, manifest]) => channel + '=' + manifest.skills.length).join(', '))
console.log('OK: closed channel set is stable + beta, and beta extends stable')
console.log('OK: beta additions match the declared previewSkills (' + previewSkills.length + ' previewed)')
console.log('OK: upstream content fingerprint matches ' + upstream.commit)
