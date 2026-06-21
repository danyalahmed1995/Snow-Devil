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
  includeDependabot: false,
  includeRenovate: false,
  includeDraftPullRequests: true,
  defaultRangeDays: 60,
  businessTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  businessDays: [1, 2, 3, 4, 5],
  branchThresholdHours: 16,
  inventoryThresholds: { agingDays: 4, staleDays: 10 },
  staleDefaultBranchDays: 7,
  cacheRetentionDays: 180,
  refreshIntervalMinutes: 30,
  releaseDeploymentStrategy: 'tag_or_sha',
  minimumPercentileSamples: 5,
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
  version: 1,
  merge: (persisted, current) => {
    const saved = persisted as Partial<AnalyticsSettingsStore>;
    const savedSettings = saved.settings ?? DEFAULT_ANALYTICS_SETTINGS;
    return {
      ...current,
      ...saved,
      settings: {
        ...DEFAULT_ANALYTICS_SETTINGS,
        ...savedSettings,
        inventoryThresholds: { ...DEFAULT_ANALYTICS_SETTINGS.inventoryThresholds, ...savedSettings.inventoryThresholds },
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
