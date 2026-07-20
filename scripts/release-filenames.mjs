export const semanticVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function validateReleaseTag(tag) {
  if (!tag || typeof tag !== 'string') {
    throw new Error('Release tag must be a string.');
  }
  if (tag !== tag.trim()) {
    throw new Error('Release tag must not contain leading or trailing whitespace.');
  }
  if (!tag.startsWith('v')) {
    throw new Error('Release tag must be supplied in the form vMAJOR.MINOR.PATCH.');
  }
  if (tag.startsWith('vv')) {
    throw new Error('Release tag must start with exactly one "v" prefix.');
  }
  const version = tag.slice(1);
  if (!semanticVersion.test(version)) {
    throw new Error(`Malformed release tag: ${tag}`);
  }
}

export function getDefinitions(releaseTag) {
  validateReleaseTag(releaseTag);
  return {
    'windows-x64': [
      { folder: 'msi', extension: '.msi', output: `Snow-Devil-${releaseTag}-Windows-x64.msi` },
      { folder: 'nsis', extension: '.exe', output: `Snow-Devil-${releaseTag}-Windows-x64-Setup.exe` },
    ],
    'linux-x64': [
      { folder: 'appimage', extension: '.AppImage', output: `Snow-Devil-${releaseTag}-Linux-x86_64.AppImage` },
      { folder: 'deb', extension: '.deb', output: `Snow-Devil-${releaseTag}-Linux-x86_64.deb` },
    ],
    'macos-apple-silicon': [
      { folder: 'dmg', extension: '.dmg', output: `Snow-Devil-${releaseTag}-macOS-Apple-Silicon.dmg` },
    ],
    'macos-intel': [
      { folder: 'dmg', extension: '.dmg', output: `Snow-Devil-${releaseTag}-macOS-Intel.dmg` },
    ],
  };
}
