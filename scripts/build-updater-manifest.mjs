import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Assemble the Tauri updater manifest (latest.json) from the per-platform
// `*-updater.json` files produced by collect-release-artifacts.mjs. The updater
// endpoint in tauri.conf.json points at this file on the GitHub release.

const [repo, tag, version] = process.argv.slice(2);
if (!repo || !tag || !version) {
  throw new Error('Usage: node scripts/build-updater-manifest.mjs <owner/repo> <tag> <version>');
}

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)));
const assetsRoot = join(workspace, 'release-assets');

const entries = await readdir(assetsRoot, { recursive: true, withFileTypes: true });
const updaterFiles = entries
  .filter(entry => entry.isFile() && entry.name.endsWith('-updater.json'))
  .map(entry => join(entry.parentPath ?? entry.path, entry.name));

if (updaterFiles.length === 0) {
  throw new Error('No *-updater.json files found under release-assets; cannot build latest.json.');
}

const platforms = {};
for (const file of updaterFiles) {
  const record = JSON.parse(await readFile(file, 'utf8'));
  if (!record.platform || !record.filename || !record.signature) {
    throw new Error(`Malformed updater record in ${file}.`);
  }
  if (platforms[record.platform]) {
    throw new Error(`Duplicate updater platform: ${record.platform}.`);
  }
  platforms[record.platform] = {
    signature: record.signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${record.filename}`,
  };
}

const requiredPlatforms = ['windows-x86_64', 'linux-x86_64', 'darwin-aarch64', 'darwin-x86_64'];
const missing = requiredPlatforms.filter(key => !platforms[key]);
if (missing.length > 0) {
  throw new Error(`latest.json is missing required platforms: ${missing.join(', ')}.`);
}

const latest = {
  version,
  notes: `Snow Devil ${tag}`,
  pub_date: new Date().toISOString(),
  platforms,
};

const outputPath = join(assetsRoot, 'latest.json');
await writeFile(outputPath, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputPath} with platforms: ${Object.keys(platforms).join(', ')}`);
