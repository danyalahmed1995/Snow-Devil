import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDefinitions } from './release-filenames.mjs';

const [label, target, releaseTag] = process.argv.slice(2);
if (!label || !target || !releaseTag) {
  throw new Error('Usage: node scripts/collect-release-artifacts.mjs <label> <target> <releaseTag>');
}

const definitions = getDefinitions(releaseTag);
const expected = definitions[label];
if (!expected) throw new Error(`Unsupported release label: ${label}`);

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)));
const bundleRoot = join(workspace, 'src-tauri', 'target', target, 'release', 'bundle');
const outputRoot = join(workspace, 'release-assets', label);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return nested.flat();
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

const files = await walk(bundleRoot);
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

let architecture = target;
if (label.startsWith('macos-')) {
  const executable = files.find(path => path.includes(`${sep}macos${sep}`) && path.includes(`${sep}Contents${sep}MacOS${sep}`));
  if (!executable) throw new Error('Could not find the macOS app executable for architecture validation.');
  const fileResult = spawnSync('file', ['-b', executable], { encoding: 'utf8' });
  const lipoResult = spawnSync('lipo', ['-info', executable], { encoding: 'utf8' });
  if (fileResult.status !== 0 || lipoResult.status !== 0) {
    throw new Error(`Architecture inspection failed: ${fileResult.stderr || lipoResult.stderr}`);
  }
  const evidence = `${fileResult.stdout}\n${lipoResult.stdout}`;
  const wanted = label === 'macos-apple-silicon' ? 'arm64' : 'x86_64';
  const unwanted = label === 'macos-apple-silicon' ? 'x86_64' : 'arm64';
  if (!evidence.includes(wanted) || evidence.includes(unwanted) || /fat file|universal/i.test(evidence)) {
    throw new Error(`Expected a non-universal ${wanted} executable, received:\n${evidence}`);
  }
  architecture = wanted;
  console.log(`macOS executable: ${relative(workspace, executable)}`);
  console.log(evidence.trim());
}

const manifest = [];
for (const definition of expected) {
  const matches = files.filter(path => {
    const normalized = path.split(sep).join('/').toLowerCase();
    return normalized.includes(`/bundle/${definition.folder}/`) && basename(path).toLowerCase().endsWith(definition.extension.toLowerCase());
  });
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${definition.folder} ${definition.extension} bundle, found ${matches.length}.`);
  }
  const source = matches[0];
  const sourceStat = await stat(source);
  if (sourceStat.size <= 0) throw new Error(`Release bundle is empty: ${source}`);
  const destination = join(outputRoot, definition.output);
  await copyFile(source, destination);
  const checksum = await sha256(destination);
  await writeFile(`${destination}.sha256`, `${checksum}  ${basename(destination)}\n`, 'utf8');
  const record = {
    platform: label,
    target,
    filename: basename(destination),
    size: sourceStat.size,
    architecture,
    sha256: checksum,
  };
  manifest.push(record);
  console.log(Object.entries(record).map(([key, value]) => `${key}=${value}`).join(' '));
}

await writeFile(join(outputRoot, `${label}-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
