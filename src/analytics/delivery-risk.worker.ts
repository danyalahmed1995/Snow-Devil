/// <reference lib="webworker" />
import { deliveryRiskInventoryAnalysis, includedRepositories } from './selectors';
import type { AnalyticsDataset, AnalyticsSettings } from './types';

interface Request { dataset: AnalyticsDataset; settings: AnalyticsSettings }

self.onmessage = (event: MessageEvent<Request>) => {
  const { dataset, settings } = event.data;
  self.postMessage({
    analysis: deliveryRiskInventoryAnalysis(dataset, settings),
    repositories: includedRepositories(dataset, settings),
  });
};
