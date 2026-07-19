import { describe, expect, it } from 'vitest';
import { createDemoAnalyticsDataset } from './demo-data';
import { DEFAULT_ANALYTICS_SETTINGS } from '../stores/analytics-settings-store';
import { getDeliveryRiskModel } from './delivery-risk-cache';

describe('delivery risk derived cache', () => {
  it('reuses an immutable model for a warm tab and invalidates on settings identity change', () => {
    const dataset = createDemoAnalyticsDataset();
    const first = getDeliveryRiskModel(dataset, DEFAULT_ANALYTICS_SETTINGS);
    expect(getDeliveryRiskModel(dataset, DEFAULT_ANALYTICS_SETTINGS)).toBe(first);
    expect(getDeliveryRiskModel(dataset, { ...DEFAULT_ANALYTICS_SETTINGS })).not.toBe(first);
  });
});
