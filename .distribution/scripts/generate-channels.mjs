import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildChannelManifests, renderJson, root } from './channel-lib.mjs'

const manifests = await buildChannelManifests()
const outputDirectory = join(root, '.distribution/channels')
await mkdir(outputDirectory, { recursive: true })

const expected = new Set(Object.keys(manifests).map((channel) => channel + '.json'))
const present = (await readdir(outputDirectory)).filter((name) => name.endsWith('.json'))
for (const name of present) {
  if (expected.has(name)) continue
  await rm(join(outputDirectory, name))
  console.log('removed stale ' + name)
}

for (const [channel, manifest] of Object.entries(manifests)) {
  await writeFile(join(outputDirectory, channel + '.json'), renderJson(manifest))
  console.log('generated ' + channel + ' (' + manifest.skills.length + ' skills)')
}
