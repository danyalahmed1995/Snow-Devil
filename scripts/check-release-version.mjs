import { readFile } from 'node:fs/promises';

const tag = process.argv[2] ?? process.env.RELEASE_TAG;
const semanticVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!tag || tag !== tag.trim() || !tag.startsWith('v')) {
  throw new Error('Release tag must be supplied in the form vMAJOR.MINOR.PATCH.');
}

const version = tag.slice(1);
if (!semanticVersion.test(version)) {
  throw new Error(`Malformed release tag: ${tag}`);
}

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tauriConfig = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const cargoToml = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const packageSection = cargoToml.match(/^\[package\]\s*$([\s\S]*?)(?=^\[[^\]]+\]\s*$|(?![\s\S]))/m)?.[1] ?? '';
const cargoVersion = packageSection.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];

const discovered = {
  tag,
  expected: version,
  'package.json': packageJson.version,
  'src-tauri/tauri.conf.json': tauriConfig.version,
  'src-tauri/Cargo.toml': cargoVersion,
};

for (const [source, value] of Object.entries(discovered)) {
  console.log(`${source}: ${value ?? 'missing'}`);
}

for (const [source, value] of Object.entries(discovered).slice(2)) {
  if (value !== version) {
    throw new Error(`${source} version ${value ?? 'missing'} does not match tag ${tag}.`);
  }
}

console.log(`Release version ${version} is consistent.`);
