import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildChannelManifests, renderJson, root } from './channel-lib.mjs'

const manifests = await buildChannelManifests()
const outputDirectory = join(root, '.distribution/channels')
await mkdir(outputDirectory, { recursive: true })

for (const [channel, manifest] of Object.entries(manifests)) {
  await writeFile(join(outputDirectory, channel + '.json'), renderJson(manifest))
  console.log('generated ' + channel + ' (' + manifest.skills.length + ' skills)')
}
