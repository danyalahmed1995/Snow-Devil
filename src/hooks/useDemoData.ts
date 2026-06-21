import { useEffect, useState } from 'react';
import { DemoDataProvider, type DemoFlow, type DemoHome, type DemoManifest } from '../data/demo-provider';

function useFixture<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [isLoading, setLoading] = useState(true);
  useEffect(() => { let active = true; load().then(value => active && setData(value)).catch(reason => active && setError(reason)).finally(() => active && setLoading(false)); return () => { active = false; }; }, [load]);
  return { data, error, isLoading };
}

export const useDemoManifest = () => useFixture<DemoManifest>(DemoDataProvider.manifest);
export const useDemoHome = () => useFixture<DemoHome>(DemoDataProvider.home);
export const useDemoFlow = () => useFixture<DemoFlow>(DemoDataProvider.flow);
