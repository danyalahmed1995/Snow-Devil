import type { RepositoryEntryType } from "./repository-types";

export type RepositoryTreeIconKind =
  | "folder"
  | "folder-open"
  | "folder-github"
  | "folder-source"
  | "folder-public"
  | "folder-docs"
  | "folder-scripts"
  | "folder-tests"
  | "folder-assets"
  | "folder-config"
  | "folder-build"
  | "folder-examples"
  | "folder-packages"
  | "folder-components"
  | "folder-styles"
  | "file-markdown"
  | "file-json"
  | "file-yaml"
  | "file-typescript"
  | "file-javascript"
  | "file-rust"
  | "file-html"
  | "file-style"
  | "file-shell"
  | "file-powershell"
  | "file-python"
  | "file-cpp"
  | "file-csharp"
  | "file-java"
  | "file-swift"
  | "file-image"
  | "file-media"
  | "file-package"
  | "file-lock"
  | "file-git"
  | "file-env"
  | "file-license"
  | "file-readme"
  | "file-binary"
  | "file-generic";

export interface RepositoryTreeIconDescriptor {
  kind: RepositoryTreeIconKind;
  label: string;
}

const SPECIAL_FOLDERS: Record<string, RepositoryTreeIconKind> = {
  ".github": "folder-github",
  ".git": "folder-github",
  "src": "folder-source",
  "source": "folder-source",
  "public": "folder-public",
  "docs": "folder-docs",
  "documentation": "folder-docs",
  "scripts": "folder-scripts",
  "script": "folder-scripts",
  "test": "folder-tests",
  "tests": "folder-tests",
  "__tests__": "folder-tests",
  "assets": "folder-assets",
  "images": "folder-assets",
  "img": "folder-assets",
  "config": "folder-config",
  ".config": "folder-config",
  "build": "folder-build",
  "dist": "folder-build",
  "out": "folder-build",
  "examples": "folder-examples",
  "samples": "folder-examples",
  "packages": "folder-packages",
  "components": "folder-components",
  "styles": "folder-styles",
  "css": "folder-styles",
};

const EXTENSIONS: Record<string, RepositoryTreeIconKind> = {
  md: "file-markdown",
  mdx: "file-markdown",
  json: "file-json",
  yml: "file-yaml",
  yaml: "file-yaml",
  ts: "file-typescript",
  tsx: "file-typescript",
  js: "file-javascript",
  jsx: "file-javascript",
  mjs: "file-javascript",
  cjs: "file-javascript",
  rs: "file-rust",
  html: "file-html",
  htm: "file-html",
  css: "file-style",
  scss: "file-style",
  sass: "file-style",
  less: "file-style",
  sh: "file-shell",
  bash: "file-shell",
  zsh: "file-shell",
  fish: "file-shell",
  ps1: "file-powershell",
  psm1: "file-powershell",
  py: "file-python",
  c: "file-cpp",
  cc: "file-cpp",
  cpp: "file-cpp",
  cxx: "file-cpp",
  h: "file-cpp",
  hpp: "file-cpp",
  cs: "file-csharp",
  java: "file-java",
  kt: "file-java",
  kts: "file-java",
  swift: "file-swift",
  png: "file-image",
  jpg: "file-image",
  jpeg: "file-image",
  webp: "file-image",
  gif: "file-image",
  svg: "file-image",
  mp4: "file-media",
  mov: "file-media",
  webm: "file-media",
  mp3: "file-media",
  wav: "file-media",
  flac: "file-media",
  zip: "file-binary",
  gz: "file-binary",
  "7z": "file-binary",
  exe: "file-binary",
  dll: "file-binary",
  wasm: "file-binary",
  pdf: "file-binary",
};

const FILENAMES: Record<string, RepositoryTreeIconKind> = {
  "package.json": "file-package",
  "pnpm-lock.yaml": "file-lock",
  "package-lock.json": "file-lock",
  "yarn.lock": "file-lock",
  "cargo.toml": "file-rust",
  "cargo.lock": "file-lock",
  ".gitignore": "file-git",
  ".gitattributes": "file-git",
  ".gitmodules": "file-git",
  ".env": "file-env",
  ".env.local": "file-env",
  "license": "file-license",
  "license.md": "file-license",
  "license.txt": "file-license",
  "readme": "file-readme",
  "readme.md": "file-readme",
  "readme.mdx": "file-readme",
};

const LABELS: Record<RepositoryTreeIconKind, string> = {
  "folder": "Folder",
  "folder-open": "Open folder",
  "folder-github": "GitHub folder",
  "folder-source": "Source folder",
  "folder-public": "Public folder",
  "folder-docs": "Documentation folder",
  "folder-scripts": "Scripts folder",
  "folder-tests": "Tests folder",
  "folder-assets": "Assets folder",
  "folder-config": "Configuration folder",
  "folder-build": "Build output folder",
  "folder-examples": "Examples folder",
  "folder-packages": "Packages folder",
  "folder-components": "Components folder",
  "folder-styles": "Styles folder",
  "file-markdown": "Markdown file",
  "file-json": "JSON file",
  "file-yaml": "YAML file",
  "file-typescript": "TypeScript file",
  "file-javascript": "JavaScript file",
  "file-rust": "Rust file",
  "file-html": "HTML file",
  "file-style": "Stylesheet file",
  "file-shell": "Shell script",
  "file-powershell": "PowerShell script",
  "file-python": "Python file",
  "file-cpp": "C or C++ file",
  "file-csharp": "C# file",
  "file-java": "Java or Kotlin file",
  "file-swift": "Swift file",
  "file-image": "Image file",
  "file-media": "Media file",
  "file-package": "Package manifest",
  "file-lock": "Lockfile",
  "file-git": "Git configuration file",
  "file-env": "Environment file",
  "file-license": "License file",
  "file-readme": "Readme file",
  "file-binary": "Binary file",
  "file-generic": "File",
};

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export function resolveRepositoryTreeIcon(path: string, type: RepositoryEntryType, open = false): RepositoryTreeIconDescriptor {
  const name = basename(path).toLowerCase();
  if (type === "tree") {
    const kind = SPECIAL_FOLDERS[name] ?? (open ? "folder-open" : "folder");
    return { kind, label: LABELS[kind] };
  }
  const filenameKind = FILENAMES[name];
  if (filenameKind) return { kind: filenameKind, label: LABELS[filenameKind] };
  if (name.startsWith(".env")) return { kind: "file-env", label: LABELS["file-env"] };
  if (name.endsWith(".lock") || name.includes("lockfile")) return { kind: "file-lock", label: LABELS["file-lock"] };
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  const kind = EXTENSIONS[extension] ?? "file-generic";
  return { kind, label: LABELS[kind] };
}
