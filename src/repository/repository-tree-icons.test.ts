import { describe, expect, it } from 'vitest';
import { resolveRepositoryTreeIcon } from './repository-tree-icons';

describe('repository tree icon resolver', () => {
  it('resolves generic folder closed and open icons', () => {
    expect(resolveRepositoryTreeIcon('lib', 'tree').kind).toBe('folder');
    expect(resolveRepositoryTreeIcon('lib', 'tree', true).kind).toBe('folder-open');
  });

  it('resolves special folder-name icons case-insensitively', () => {
    expect(resolveRepositoryTreeIcon('.github', 'tree').kind).toBe('folder-github');
    expect(resolveRepositoryTreeIcon('SRC', 'tree').kind).toBe('folder-source');
    expect(resolveRepositoryTreeIcon('docs', 'tree').kind).toBe('folder-docs');
    expect(resolveRepositoryTreeIcon('scripts', 'tree').kind).toBe('folder-scripts');
    expect(resolveRepositoryTreeIcon('__tests__', 'tree').kind).toBe('folder-tests');
    expect(resolveRepositoryTreeIcon('assets', 'tree').kind).toBe('folder-assets');
    expect(resolveRepositoryTreeIcon('.config', 'tree').kind).toBe('folder-config');
    expect(resolveRepositoryTreeIcon('dist', 'tree').kind).toBe('folder-build');
    expect(resolveRepositoryTreeIcon('components', 'tree').kind).toBe('folder-components');
    expect(resolveRepositoryTreeIcon('styles', 'tree').kind).toBe('folder-styles');
  });

  it('gives filename-specific rules precedence over extensions', () => {
    expect(resolveRepositoryTreeIcon('package.json', 'blob').kind).toBe('file-package');
    expect(resolveRepositoryTreeIcon('Cargo.toml', 'blob').kind).toBe('file-rust');
    expect(resolveRepositoryTreeIcon('README.md', 'blob').kind).toBe('file-readme');
    expect(resolveRepositoryTreeIcon('LICENSE', 'blob').kind).toBe('file-license');
    expect(resolveRepositoryTreeIcon('.gitignore', 'blob').kind).toBe('file-git');
    expect(resolveRepositoryTreeIcon('.env.local', 'blob').kind).toBe('file-env');
  });

  it('resolves common file extension icons', () => {
    expect(resolveRepositoryTreeIcon('guide.mdx', 'blob').kind).toBe('file-markdown');
    expect(resolveRepositoryTreeIcon('data.json', 'blob').kind).toBe('file-json');
    expect(resolveRepositoryTreeIcon('workflow.yml', 'blob').kind).toBe('file-yaml');
    expect(resolveRepositoryTreeIcon('App.tsx', 'blob').kind).toBe('file-typescript');
    expect(resolveRepositoryTreeIcon('server.mjs', 'blob').kind).toBe('file-javascript');
    expect(resolveRepositoryTreeIcon('main.rs', 'blob').kind).toBe('file-rust');
    expect(resolveRepositoryTreeIcon('index.html', 'blob').kind).toBe('file-html');
    expect(resolveRepositoryTreeIcon('theme.scss', 'blob').kind).toBe('file-style');
    expect(resolveRepositoryTreeIcon('deploy.ps1', 'blob').kind).toBe('file-powershell');
    expect(resolveRepositoryTreeIcon('script.py', 'blob').kind).toBe('file-python');
    expect(resolveRepositoryTreeIcon('native.cpp', 'blob').kind).toBe('file-cpp');
    expect(resolveRepositoryTreeIcon('Program.cs', 'blob').kind).toBe('file-csharp');
    expect(resolveRepositoryTreeIcon('Main.kt', 'blob').kind).toBe('file-java');
    expect(resolveRepositoryTreeIcon('App.swift', 'blob').kind).toBe('file-swift');
    expect(resolveRepositoryTreeIcon('logo.svg', 'blob').kind).toBe('file-image');
    expect(resolveRepositoryTreeIcon('clip.mp4', 'blob').kind).toBe('file-media');
  });
});
