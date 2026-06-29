import type { RepositoryBranch, RepositoryEntry, RepositoryFile } from './repository-types';

const FILES: Record<string, string> = {
  'README.md': '# Snow Devil\n\nA premium, keyboard-first GitHub workflow and source browser.\n\n## Highlights\n\n- Native repository explorer\n- Deterministic offline demo\n- Workflow intelligence\n',
  'package.json': '{\n  "name": "snow-devil",\n  "private": true,\n  "scripts": { "dev": "vite", "test": "vitest run" }\n}\n',
  'src/main.tsx': "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './app/App';\n\ncreateRoot(document.getElementById('root')!).render(<App />);\n",
  'src/app/App.tsx': "import { Layout } from '../../components/layout/Layout';\n\nexport default function App() {\n  return <Layout />;\n}\n",
  'src/styles/tokens.css': ':root {\n  --bg-primary: #080d14;\n  --accent: #3b8ef3;\n  --text-primary: #e6edf3;\n}\n',
  'docs/architecture.md': '# Architecture\n\nThe native workspace reuses typed tabs, shared data providers, and a read-only GitHub adapter.\n',
  'Benchmark Files/heavy_mdx_5mb_examples/01-large-doc.mdx': '# Oversized benchmark\n',
  'Benchmark Files/path with spaces/read me.md': '# Spaced path\n',
  'Benchmark Files/url-sensitive/100% ready #1?.md': '# Punctuation path\n',
  'Unicode/雪.md': '# Unicode path\n',
  'assets/snow-devil-mark.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#0d1620"/><path d="M24 72 60 20l36 52-36 28z" fill="#58a6ff"/></svg>',
  'assets/unsafe-preview.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><script>alert(1)</script><image href="https://example.com/tracker.png"/><rect width="80" height="80" fill="#f05d5e" onload="alert(2)"/></svg>',
  'assets/theme-preview.png': '',
  'assets/product-shot.jpg': '',
  'assets/oversized-preview.png': '',
  'dist/snow-devil-preview.zip': '',
};

export const demoBranches: RepositoryBranch[] = [
  { name: 'main', kind: 'branch', isDefault: true },
  { name: 'feat/native-browser', kind: 'branch' },
  { name: 'release/2.4', kind: 'branch' },
  { name: 'v2.4.0', kind: 'tag' },
];

export function demoTree(path = ''): RepositoryEntry[] {
  const prefix = path ? `${path}/` : '';
  const children = new Map<string, RepositoryEntry>();
  for (const fullPath of Object.keys(FILES)) {
    if (!fullPath.startsWith(prefix)) continue;
    const remainder = fullPath.slice(prefix.length);
    const [name, ...rest] = remainder.split('/');
    if (!name) continue;
    const childPath = `${prefix}${name}`;
    children.set(name, { name, path: childPath, type: rest.length ? 'tree' : 'blob' });
  }
  return [...children.values()];
}

export function demoAllEntries(): RepositoryEntry[] {
  const paths=new Map<string,RepositoryEntry>();
  for(const fullPath of Object.keys(FILES)){const parts=fullPath.split('/');for(let index=0;index<parts.length;index++){const path=parts.slice(0,index+1).join('/');paths.set(path,{name:parts[index],path,type:index===parts.length-1?'blob':'tree'});}}
  return [...paths.values()];
}

export function demoFile(path: string): RepositoryFile | undefined {
  if (!(path in FILES)) return undefined;
  if(path.endsWith('01-large-doc.mdx')) return { text:FILES[path],mimeType:'text/markdown',byteSize:5_250_000,path };
  if(path.endsWith('oversized-preview.png')) return { text:null,mimeType:'image/png',byteSize:6_500_000,path };
  if(path.endsWith('.png')) return { text:null,contentBase64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8Y8WQAAAABJRU5ErkJggg==',mimeType:'image/png',byteSize:70,path };
  if(path.endsWith('.jpg')) return { text:null,contentBase64:'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=',mimeType:'image/jpeg',byteSize:286,path };
  const text = path.endsWith('.zip') ? null : FILES[path];
  return { text, byteSize: path.endsWith('.zip') ? 2_400_000 : new TextEncoder().encode(text ?? '').byteLength, path, mimeType:path.endsWith('.svg')?'image/svg+xml':undefined };
}

export const demoPullRequest = {
  baseRefName: 'main', headRefName: 'feat/native-browser',
  title: 'Add native repository explorer and command palette', state: 'OPEN', author: { login: 'snowdevil-demo' }, createdAt: '2026-02-13T10:00:00Z', reviewDecision: 'REVIEW_REQUIRED',
  body: 'Connects workflow context to source navigation through typed native tabs.',
  diff: `diff --git a/src/app/App.tsx b/src/app/App.tsx\nindex 312a..82bc 100644\n--- a/src/app/App.tsx\n+++ b/src/app/App.tsx\n@@ -1,4 +1,6 @@\n import { Layout } from './Layout';\n+import { CommandPalette } from '../palette/CommandPalette';\n \n export default function App() {\n-  return <Layout />;\n+  return <><Layout /><CommandPalette /></>;\n }\ndiff --git a/src/styles/tokens.css b/src/styles/tokens.css\nindex b42d..ad91 100644\n--- a/src/styles/tokens.css\n+++ b/src/styles/tokens.css\n@@ -1,3 +1,4 @@\n :root {\n-  --bg-primary: #0d1117;\n+  --bg-primary: #080d14;\n+  --accent: #3b8ef3;\n }\n`,
};
