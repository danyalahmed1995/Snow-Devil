import { describe, it, expect } from 'vitest';
import { getDefinitions, validateReleaseTag } from '../scripts/release-filenames.mjs';

describe('Release Filenames and Tag Validation', () => {
  it('should assert all six exact filenames for a sample tag v0.1.0', () => {
    const tag = 'v0.1.0';
    const definitions = getDefinitions(tag);

    expect(definitions['windows-x64']).toEqual([
      { folder: 'msi', extension: '.msi', output: 'Snow-Devil-v0.1.0-Windows-x64.msi' },
      { folder: 'nsis', extension: '.exe', output: 'Snow-Devil-v0.1.0-Windows-x64-Setup.exe' },
    ]);

    expect(definitions['linux-x64']).toEqual([
      { folder: 'appimage', extension: '.AppImage', output: 'Snow-Devil-v0.1.0-Linux-x86_64.AppImage' },
      { folder: 'deb', extension: '.deb', output: 'Snow-Devil-v0.1.0-Linux-x86_64.deb' },
    ]);

    expect(definitions['macos-apple-silicon']).toEqual([
      { folder: 'dmg', extension: '.dmg', output: 'Snow-Devil-v0.1.0-macOS-Apple-Silicon.dmg' },
    ]);

    expect(definitions['macos-intel']).toEqual([
      { folder: 'dmg', extension: '.dmg', output: 'Snow-Devil-v0.1.0-macOS-Intel.dmg' },
    ]);
  });

  it('should accept valid semantic tags', () => {
    expect(() => validateReleaseTag('v0.1.0')).not.toThrow();
    expect(() => validateReleaseTag('v1.2.3')).not.toThrow();
    expect(() => validateReleaseTag('v1.2.3-beta.1')).not.toThrow();
  });

  it('should reject invalid tags', () => {
    expect(() => validateReleaseTag('vbanana')).toThrow();
    expect(() => validateReleaseTag('v1')).toThrow();
    expect(() => validateReleaseTag('v1.2')).toThrow();
    expect(() => validateReleaseTag('v1.2.3.4')).toThrow();
    expect(() => validateReleaseTag('vv1.2.3')).toThrow();
    expect(() => validateReleaseTag(' v1.2.3')).toThrow();
    expect(() => validateReleaseTag('v1.2.3 ')).toThrow();
    expect(() => validateReleaseTag('')).toThrow();
    expect(() => validateReleaseTag(null as unknown as string)).toThrow();
  });
});
