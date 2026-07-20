declare module '*/scripts/release-filenames.mjs' {
  export interface AssetDefinition {
    folder: string;
    extension: string;
    output: string;
  }
  export function validateReleaseTag(tag: string): void;
  export function getDefinitions(releaseTag: string): Record<string, AssetDefinition[]>;
}
