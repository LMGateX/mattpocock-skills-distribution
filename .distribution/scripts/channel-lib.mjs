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

export async function buildChannelManifests() {
  const upstream = await readJson('.distribution/upstream.json')
  const plugin = await readJson('.claude-plugin/plugin.json')

  if (!Array.isArray(plugin.skills) || plugin.skills.length === 0) {
    throw new Error('Upstream .claude-plugin/plugin.json has no skills array')
  }

  const skills = [...plugin.skills]
  if (new Set(skills).size !== skills.length) {
    throw new Error('Upstream .claude-plugin/plugin.json lists a skill more than once')
  }

  return {
    stable: {
      schemaVersion: 1,
      channel: 'stable',
      stability: 'stable',
      upstreamCommit: upstream.commit,
      generatedFrom: '.claude-plugin/plugin.json',
      skills
    }
  }
}

export function skillNameFromMarkdown(markdown) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1]
  if (!frontmatter) return undefined
  return /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(frontmatter)?.[1]
}
