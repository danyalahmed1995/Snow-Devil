export const ARCHITECTURE_ALGORITHM_VERSION = 2;

export function architectureContextEnabled(): boolean {
  const configured = import.meta.env.VITE_FEATURE_ARCHITECTURE_CONTEXT;
  return configured == null || configured === '' || configured === '1' || configured.toLowerCase() === 'true';
}
