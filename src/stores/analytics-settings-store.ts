import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnalyticsSettings, RepositoryAnalyticsOverride } from '../analytics/types';

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  includedRepositories: [],
  ignoredRepositories: [],
  includeArchived: false,
  includeForks: false,
  includePrivate: true,
  includeBots: false,
  analyticsIncludeBots: false,
  includeDependabot: false,
  includeRenovate: false,
  includeOtherBots: false,
  includeDraftPullRequests: true,
  defaultRangeDays: 60,
  businessTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  businessDays: [1, 2, 3, 4, 5],
  branchThresholdHours: 16,
  inventoryThresholds: { agingDays: 8, staleDays: 30, reviewWaitDays: 3 },
  staleDefaultBranchDays: 7,
  cacheRetentionDays: 180,
  refreshIntervalMinutes: 30,
  releaseDeploymentStrategy: 'tag_or_sha',
  releaseMatchingStrategy: 'tag_or_sha',
  deploymentMatchingStrategy: 'environment_or_sha',
  minimumPercentileSamples: 5,
  reducedMotion: false,
  mutedDeliveryRiskItems: [],
  mutedDeliveryRiskRepositories: [],
  mutedDeliveryRiskReasons: [],
  deliveryRiskMuteMetadata: {},
  deliveryRiskSavedViews: [],
  repositoryOverrides: {},
};

interface AnalyticsSettingsStore {
  settings: AnalyticsSettings;
  updateSettings: (update: Partial<AnalyticsSettings>) => void;
  updateRepositoryOverride: (repositoryId: string, update: RepositoryAnalyticsOverride) => void;
  resetSettings: () => void;
}

export const useAnalyticsSettingsStore = create<AnalyticsSettingsStore>()(persist((set) => ({
  settings: DEFAULT_ANALYTICS_SETTINGS,
  updateSettings: update => set(state => ({ settings: { ...state.settings, ...update } })),
  updateRepositoryOverride: (repositoryId, update) => set(state => ({
    settings: {
      ...state.settings,
      repositoryOverrides: {
        ...state.settings.repositoryOverrides,
        [repositoryId]: { ...state.settings.repositoryOverrides[repositoryId], ...update },
      },
    },
  })),
  resetSettings: () => set({ settings: DEFAULT_ANALYTICS_SETTINGS }),
}), {
  name: 'snow-devil-analytics-settings',
  version: 4,
  merge: (persisted, current) => {
    const saved = persisted as Partial<AnalyticsSettingsStore>;
    const savedSettings = saved.settings && typeof saved.settings === 'object' ? saved.settings : DEFAULT_ANALYTICS_SETTINGS;
    const savedViews = Array.isArray(savedSettings.deliveryRiskSavedViews) ? savedSettings.deliveryRiskSavedViews.map(view => ({
      ...view,
      category: String(view.category) === 'merged_delivery_unknown' ? 'delivery_status_unknown' : view.category,
      muted: view.muted ?? 'hide',
      confidence: view.confidence ?? 'all',
      backlog: view.backlog ?? 'active',
      sort: view.sort ?? 'priority',
    })) : [];
    const lastView = savedSettings.deliveryRiskLastView ? {
      ...savedSettings.deliveryRiskLastView,
      category: String(savedSettings.deliveryRiskLastView.category) === 'merged_delivery_unknown' ? 'delivery_status_unknown' : savedSettings.deliveryRiskLastView.category,
    } : undefined;
    return {
      ...current,
      ...saved,
      settings: {
        ...DEFAULT_ANALYTICS_SETTINGS,
        ...savedSettings,
        analyticsIncludeBots: savedSettings.analyticsIncludeBots ?? savedSettings.includeBots ?? false,
        inventoryThresholds: { ...DEFAULT_ANALYTICS_SETTINGS.inventoryThresholds, ...savedSettings.inventoryThresholds },
        mutedDeliveryRiskItems: Array.isArray(savedSettings.mutedDeliveryRiskItems) ? savedSettings.mutedDeliveryRiskItems : [],
        mutedDeliveryRiskRepositories: Array.isArray(savedSettings.mutedDeliveryRiskRepositories) ? savedSettings.mutedDeliveryRiskRepositories : Array.isArray(savedSettings.ignoredRepositories) ? savedSettings.ignoredRepositories : [],
        mutedDeliveryRiskReasons: Array.isArray(savedSettings.mutedDeliveryRiskReasons) ? savedSettings.mutedDeliveryRiskReasons : [],
        deliveryRiskMuteMetadata: savedSettings.deliveryRiskMuteMetadata && typeof savedSettings.deliveryRiskMuteMetadata === 'object' ? savedSettings.deliveryRiskMuteMetadata : {},
        deliveryRiskSavedViews: savedViews,
        deliveryRiskLastView: lastView,
        repositoryOverrides: savedSettings.repositoryOverrides ?? {},
      },
    };
  },
}));

export function effectiveRepositorySettings(settings: AnalyticsSettings, repositoryId: string) {
  const override = settings.repositoryOverrides[repositoryId] ?? {};
  return {
    included: override.included ?? !settings.ignoredRepositories.includes(repositoryId),
    branchThresholdHours: override.branchThresholdHours ?? settings.branchThresholdHours,
    inventoryThresholds: override.inventoryThresholds ?? settings.inventoryThresholds,
    releaseMatching: override.releaseMatching,
    deploymentMatching: override.deploymentMatching,
    defaultBranch: override.defaultBranch,
    includeBots: override.includeBots ?? settings.includeBots,
    capabilityNote: override.capabilityNote,
  };
}
