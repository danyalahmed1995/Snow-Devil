import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const [label, target, version] = process.argv.slice(2);
if (!label || !target || !version) {
  throw new Error('Usage: node scripts/collect-release-artifacts.mjs <label> <target> <version>');
}

const definitions = {
  'windows-x64': [
    { folder: 'msi', extension: '.msi', output: `Snow-Devil_${version}_windows-x64.msi` },
    { folder: 'nsis', extension: '.exe', output: `Snow-Devil_${version}_windows-x64_setup.exe` },
  ],
  'linux-x64': [
    { folder: 'appimage', extension: '.AppImage', output: `Snow-Devil_${version}_linux-x86_64.AppImage` },
    { folder: 'deb', extension: '.deb', output: `Snow-Devil_${version}_linux-x86_64.deb` },
  ],
  'macos-apple-silicon': [
    { folder: 'dmg', extension: '.dmg', output: `Snow-Devil_${version}_macos-aarch64.dmg` },
  ],
  'macos-intel': [
    { folder: 'dmg', extension: '.dmg', output: `Snow-Devil_${version}_macos-x86_64.dmg` },
  ],
};

const expected = definitions[label];
if (!expected) throw new Error(`Unsupported release label: ${label}`);

// Updater artifact per platform: the file tauri-plugin-updater downloads and
// verifies. Windows/Linux reuse the already-published installer (same bytes, so
// the .sig stays valid after the rename); macOS uses a separate `.app.tar.gz`
// that must be published as an extra asset. `key` is the Tauri updater target.
const updaterDefinitions = {
  'windows-x64': { key: 'windows-x86_64', folder: 'nsis', suffix: '-setup.exe', filename: `Snow-Devil_${version}_windows-x64_setup.exe`, publish: false },
  'linux-x64': { key: 'linux-x86_64', folder: 'appimage', suffix: '.AppImage', filename: `Snow-Devil_${version}_linux-x86_64.AppImage`, publish: false },
  'macos-apple-silicon': { key: 'darwin-aarch64', folder: 'macos', suffix: '.app.tar.gz', filename: `Snow-Devil_${version}_macos-aarch64.app.tar.gz`, publish: true },
  'macos-intel': { key: 'darwin-x86_64', folder: 'macos', suffix: '.app.tar.gz', filename: `Snow-Devil_${version}_macos-x86_64.app.tar.gz`, publish: true },
};

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

// Capture the signed updater artifact so the publish job can build latest.json.
const updater = updaterDefinitions[label];
if (!updater) throw new Error(`No updater definition for label: ${label}`);

const updaterArtifacts = files.filter(path => {
  const normalized = path.split(sep).join('/').toLowerCase();
  return normalized.includes(`/bundle/${updater.folder}/`) && basename(path).toLowerCase().endsWith(updater.suffix.toLowerCase());
});
if (updaterArtifacts.length !== 1) {
  throw new Error(`Expected exactly one updater artifact (*${updater.suffix}) in bundle/${updater.folder}, found ${updaterArtifacts.length}.`);
}
const updaterArtifact = updaterArtifacts[0];

const signaturePath = `${updaterArtifact}.sig`;
const signature = await readFile(signaturePath, 'utf8').then(value => value.trim()).catch(() => {
  throw new Error(`Missing updater signature for ${basename(updaterArtifact)}. Ensure createUpdaterArtifacts is enabled and TAURI_SIGNING_PRIVATE_KEY is set in the build step.`);
});
if (!signature) throw new Error(`Empty updater signature for ${basename(updaterArtifact)}.`);

if (updater.publish) {
  const destination = join(outputRoot, updater.filename);
  await copyFile(updaterArtifact, destination);
  const checksum = await sha256(destination);
  console.log(`updater-artifact platform=${updater.key} filename=${updater.filename} sha256=${checksum}`);
}

await writeFile(
  join(outputRoot, `${label}-updater.json`),
  `${JSON.stringify({ platform: updater.key, filename: updater.filename, signature, version }, null, 2)}\n`,
  'utf8',
);
console.log(`updater platform=${updater.key} file=${updater.filename} signatureBytes=${signature.length}`);
