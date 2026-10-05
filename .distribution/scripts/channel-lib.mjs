import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readlinkSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function gitBuffer(...args) {
  return execFileSync('git', args, { cwd: root })
}

function gitText(...args) {
  return gitBuffer(...args).toString('utf8').trim()
}

function isDistributionPath(path) {
  return path === 'DISTRIBUTION.md' || path.startsWith('.distribution/')
}

function aggregateEntries(entries) {
  const hash = createHash('sha256')
  for (const entry of entries.sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(entry.mode)
    hash.update(' ')
    hash.update(entry.object)
    hash.update('\0')
    hash.update(entry.path)
    hash.update('\0')
  }
  return hash.digest('hex')
}

export async function readJson(relativePath) {
  return JSON.parse(await readFile(join(root, relativePath), 'utf8'))
}

export function renderJson(value) {
  return JSON.stringify(value, null, 2) + '\n'
}

export function commitContentDigest(commit) {
  const records = gitBuffer('ls-tree', '-r', '-z', commit).toString('utf8').split('\0').filter(Boolean)
  const entries = records.map((record) => {
    const match = /^(\d+)\s+\w+\s+([0-9a-f]+)\t([\s\S]+)$/.exec(record)
    if (!match) throw new Error('Cannot parse git ls-tree record: ' + record)
    return { mode: match[1], object: match[2], path: match[3] }
  }).filter((entry) => !isDistributionPath(entry.path))
  return aggregateEntries(entries)
}

export function workingContentDigest() {
  const records = gitBuffer('ls-files', '-s', '-z').toString('utf8').split('\0').filter(Boolean)
  const entries = records.map((record) => {
    const match = /^(\d+)\s+([0-9a-f]+)\s+(\d+)\t([\s\S]+)$/.exec(record)
    if (!match) throw new Error('Cannot parse git ls-files record: ' + record)
    if (match[3] !== '0') throw new Error('Cannot fingerprint an unresolved index entry: ' + match[4])
    return { mode: match[1], object: match[2], path: match[4] }
  }).filter((entry) => !isDistributionPath(entry.path))

  for (const entry of entries) {
    if (entry.mode === '160000') continue
    if (entry.mode === '120000') {
      entry.object = execFileSync('git', ['hash-object', '--stdin'], {
        cwd: root,
        input: readlinkSync(join(root, entry.path)),
        encoding: 'utf8'
      }).trim()
      continue
    }
    entry.object = gitText('hash-object', '--path=' + entry.path, entry.path)
  }
  return aggregateEntries(entries)
}

/**
 * Runs from a Git command whose output may legitimately be empty, unlike gitText,
 * which trims and would collapse "no tags" and "one blank line" together.
 */
function gitLines(...args) {
  return gitBuffer(...args).toString('utf8').split(/\r?\n/).filter(Boolean)
}

/**
 * A recorded release must be the tag that actually points at the pinned commit, so
 * the two can never drift apart. `null` is the deliberate "ahead of every upstream
 * release" state and is accepted; a non-empty string that no longer resolves to the
 * pin is an error rather than a silently stale label.
 */
export function assertUpstreamRelease(upstream) {
  const release = upstream.upstreamRelease
  if (release === null) return
  if (typeof release !== 'string' || release.trim() === '') {
    throw new Error('.distribution/upstream.json upstreamRelease must be a tag name or null')
  }
  const tags = gitLines('tag', '--points-at', upstream.commit)
  if (!tags.includes(release)) {
    throw new Error(
      'Recorded upstreamRelease ' + release + ' does not point at upstream commit ' + upstream.commit +
      '; set it to the tag that does, or to null when the pin is ahead of every release. Tags there: ' +
      (tags.join(', ') || 'none')
    )
  }
}

/**
 * The two channels this distribution always publishes. `stable` mirrors upstream's
 * promoted set; `beta` is `stable` plus the explicitly previewed Skills. When
 * `previewSkills` is empty the two resolve to the same set, which is deliberate:
 * the channel set is a public interface, and removing a channel would break every
 * profile that selected it.
 */
export const CHANNELS = ['stable', 'beta']

export async function buildChannelManifests() {
  const upstream = await readJson('.distribution/upstream.json')
  const plugin = await readJson('.claude-plugin/plugin.json')

  assertUpstreamRelease(upstream)

  if (!Array.isArray(plugin.skills) || plugin.skills.length === 0) {
    throw new Error('Upstream .claude-plugin/plugin.json has no skills array')
  }

  const stableSkills = [...plugin.skills]
  if (new Set(stableSkills).size !== stableSkills.length) {
    throw new Error('Upstream .claude-plugin/plugin.json lists a skill more than once')
  }

  const previewSkills = upstream.previewSkills
  if (!Array.isArray(previewSkills)) {
    throw new Error('.distribution/upstream.json must declare a previewSkills array')
  }
  if (new Set(previewSkills).size !== previewSkills.length) {
    throw new Error('.distribution/upstream.json lists a preview Skill more than once')
  }
  for (const path of previewSkills) {
    if (stableSkills.includes(path)) {
      throw new Error('preview Skill ' + path + ' is already in the promoted set; drop it from previewSkills')
    }
  }
  const betaSkills = [...stableSkills, ...previewSkills]

  return {
    stable: {
      schemaVersion: 1,
      channel: 'stable',
      stability: 'stable',
      upstreamCommit: upstream.commit,
      generatedFrom: '.claude-plugin/plugin.json',
      skills: stableSkills
    },
    beta: {
      schemaVersion: 1,
      channel: 'beta',
      stability: 'beta',
      upstreamCommit: upstream.commit,
      generatedFrom: '.claude-plugin/plugin.json + .distribution/upstream.json',
      extends: 'stable',
      additionalSkills: [...previewSkills],
      skills: betaSkills
    }
  }
}

export function skillNameFromMarkdown(markdown) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1]
  if (!frontmatter) return undefined
  return /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(frontmatter)?.[1]
}
