import { afterEach, describe, expect, it, vi } from 'vitest';
import { architectureContextEnabled } from './feature';

describe('architecture_context feature flag', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is disabled without mounting analysis when explicitly false', () => { vi.stubEnv('VITE_FEATURE_ARCHITECTURE_CONTEXT', 'false'); expect(architectureContextEnabled()).toBe(false); });
  it('is enabled for qualification by default', () => { vi.stubEnv('VITE_FEATURE_ARCHITECTURE_CONTEXT', 'true'); expect(architectureContextEnabled()).toBe(true); });
});
