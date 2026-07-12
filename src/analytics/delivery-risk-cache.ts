import { deliveryRiskInventoryAnalysis, includedRepositories } from './selectors';
import type { AnalyticsSettings, AnalyticsDataset } from './types';
import { useEffect, useState } from 'react';
import { acquireFrontendResource } from '../diagnostics/leak-diagnostics';

type CachedDeliveryRiskModel = {
  analysis: ReturnType<typeof deliveryRiskInventoryAnalysis>;
  repositories: ReturnType<typeof includedRepositories>;
};

const datasets = new WeakMap<AnalyticsDataset, WeakMap<AnalyticsSettings, CachedDeliveryRiskModel>>();

/** Cache immutable derived data without retaining datasets or settings after query eviction. */
export function getDeliveryRiskModel(dataset: AnalyticsDataset, settings: AnalyticsSettings): CachedDeliveryRiskModel {
  let settingsCache = datasets.get(dataset);
  if (!settingsCache) {
    settingsCache = new WeakMap();
    datasets.set(dataset, settingsCache);
  }
  const cached = settingsCache.get(settings);
  if (cached) return cached;
  const effective = { ...settings, includeArchived: true, includeForks: true, includeBots: true, includeDependabot: true, includeRenovate: true, includeOtherBots: true };
  const model = {
    analysis: deliveryRiskInventoryAnalysis(dataset, effective),
    repositories: includedRepositories(dataset, effective),
  };
  settingsCache.set(settings, model);
  return model;
}

function effectiveSettings(settings: AnalyticsSettings): AnalyticsSettings {
  return { ...settings, includeArchived: true, includeForks: true, includeBots: true, includeDependabot: true, includeRenovate: true, includeOtherBots: true };
}

export function useDeliveryRiskModel(dataset: AnalyticsDataset | undefined, settings: AnalyticsSettings) {
  const cached = dataset ? datasets.get(dataset)?.get(settings) : undefined;
  const [state, setState] = useState<{ key?: AnalyticsDataset; settings?: AnalyticsSettings; model?: CachedDeliveryRiskModel; error?: Error }>(() => ({ key: dataset, settings, model: cached }));
  const current = state.key === dataset && state.settings === settings ? state : { key: dataset, settings, model: cached };

  useEffect(() => {
    if (!dataset || cached) return;
    if (typeof Worker === 'undefined') {
      const timer = window.setTimeout(() => {
        try { setState({ key: dataset, settings, model: getDeliveryRiskModel(dataset, settings) }); }
        catch (cause) { setState({ key: dataset, settings, error: cause instanceof Error ? cause : new Error(String(cause)) }); }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const worker = new Worker(new URL('./delivery-risk.worker.ts', import.meta.url), { type: 'module', name: 'delivery-risk-analysis' });
    const releaseWorker = acquireFrontendResource('workers');
    const terminate = () => { worker.onmessage = null; worker.onerror = null; worker.terminate(); releaseWorker(); };
    worker.onmessage = (event: MessageEvent<CachedDeliveryRiskModel>) => {
      let settingsCache = datasets.get(dataset);
      if (!settingsCache) { settingsCache = new WeakMap(); datasets.set(dataset, settingsCache); }
      settingsCache.set(settings, event.data);
      setState({ key: dataset, settings, model: event.data });
      terminate();
    };
    worker.onerror = event => {
      setState({ key: dataset, settings, error: new Error(event.message || 'Delivery risk analysis failed') });
      terminate();
    };
    worker.postMessage({ dataset, settings: effectiveSettings(settings) });
    return terminate;
  }, [cached, dataset, settings]);

  return { data: current.model, isLoading: Boolean(dataset) && !current.model && !current.error, error: current.error };
}
