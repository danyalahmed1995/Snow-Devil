import { describe, expect, it } from 'vitest';
import { createDemoAnalyticsDataset } from './demo-data';
import { cumulativeFlow, includedRepositories, integrationStreak, inventoryItems, leadTimeSamples, repositoryHealth, throughputBuckets } from './selectors';
import { DEFAULT_ANALYTICS_SETTINGS, effectiveRepositorySettings } from '../stores/analytics-settings-store';

const settings = { ...DEFAULT_ANALYTICS_SETTINGS, businessTimezone: 'UTC' };

describe('delivery analytics selectors', () => {
  it('produces deterministic CI grades with documented reasons', () => {
    const rows = repositoryHealth(createDemoAnalyticsDataset(), settings, 30);
    expect(rows.map(row => row.status)).toEqual(expect.arrayContaining(['excellent', 'healthy', 'warning', 'poor']));
    expect(rows.every(row => row.reasons.length >= 3)).toBe(true);
    expect(rows.find(row => row.status === 'poor')?.branchesOverThreshold).toBeGreaterThan(1);
  });

  it('reconstructs cumulative flow, throughput, lead times, and streaks from shared events', () => {
    const dataset = createDemoAnalyticsDataset();
    expect(cumulativeFlow(dataset, 90)).toHaveLength(90);
    expect(throughputBuckets(dataset, 30).reduce((sum, bucket) => sum + bucket.merged + bucket.issuesClosed + bucket.releases + bucket.deployments, 0)).toBeGreaterThan(0);
    expect(leadTimeSamples(dataset, 'pr_to_merge').length).toBeGreaterThanOrEqual(settings.minimumPercentileSamples);
    expect(integrationStreak(dataset, 'nova-labs/snow-devil')).toBeGreaterThan(10);
  });

  it('classifies evidence-backed delivery risks and repository capabilities', () => {
    const items = inventoryItems(createDemoAnalyticsDataset(), settings);
    const categories = items.map(item => item.riskCategory);
    expect(categories).toEqual(expect.arrayContaining(['delivery_status_unknown', 'awaiting_review', 'blocked', 'ready_to_merge', 'stale']));
    expect(items.every(item => item.blockingReason.length > 3)).toBe(true);
  });

  it('applies account inclusion filters and repository overrides', () => {
    const dataset = createDemoAnalyticsDataset();
    const overridden = { ...settings, ignoredRepositories: ['nova-labs/snow-devil'], repositoryOverrides: { 'nova-labs/data-pipeline': { branchThresholdHours: 24 } } };
    expect(includedRepositories(dataset, overridden).some(repository => repository.id === 'nova-labs/snow-devil')).toBe(false);
    expect(effectiveRepositorySettings(overridden, 'nova-labs/data-pipeline').branchThresholdHours).toBe(24);
  });
});
