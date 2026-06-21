import { useState } from 'react';
import { includedRepositories } from '../../analytics/selectors';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { DEFAULT_ANALYTICS_SETTINGS, effectiveRepositorySettings, useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { AnalyticsPage, AnalyticsState, SectionCard } from './AnalyticsShared';

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return <label className="analytics-setting-row"><span>{label}<small>{description}</small></span>{children}</label>;
}

export function AnalyticsSettingsPage() {
  const analytics = useAnalyticsData();
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const updateSettings = useAnalyticsSettingsStore(state => state.updateSettings);
  const updateOverride = useAnalyticsSettingsStore(state => state.updateRepositoryOverride);
  const resetSettings = useAnalyticsSettingsStore(state => state.resetSettings);
  const [confirmReset, setConfirmReset] = useState(false);
  const repositories = analytics.data?.repositories ?? [];
  const includedCount = analytics.data ? includedRepositories(analytics.data, settings).length : 0;

  return <AnalyticsPage title="Analytics Settings" description="Control repository coverage, business time, thresholds, and evidence matching" demo={analytics.mode === 'demo'}>
    <AnalyticsState loading={analytics.isLoading} error={analytics.error} partialReasons={[]} onRetry={() => void analytics.refetch()} />
    <div className="analytics-settings">
      <SectionCard title="Account Defaults" action={<span className="analytics-status analytics-status--good">{includedCount} included</span>}>
        <div className="analytics-settings-group">
          <SettingRow label="Include archived repositories" description="Archived experiments are excluded by default"><input type="checkbox" checked={settings.includeArchived} onChange={event => updateSettings({ includeArchived: event.target.checked })} /></SettingRow>
          <SettingRow label="Include forks" description="Exclude forks from personal performance baselines"><input type="checkbox" checked={settings.includeForks} onChange={event => updateSettings({ includeForks: event.target.checked })} /></SettingRow>
          <SettingRow label="Include private repositories" description="Use private history when the account can access it"><input type="checkbox" checked={settings.includePrivate} onChange={event => updateSettings({ includePrivate: event.target.checked })} /></SettingRow>
          <SettingRow label="Include bots" description="General bot-authored work"><input type="checkbox" checked={settings.includeBots} onChange={event => updateSettings({ includeBots: event.target.checked })} /></SettingRow>
          <SettingRow label="Include Dependabot" description="Dependency update pull requests"><input type="checkbox" checked={settings.includeDependabot} onChange={event => updateSettings({ includeDependabot: event.target.checked })} /></SettingRow>
          <SettingRow label="Include Renovate" description="Renovate-authored pull requests"><input type="checkbox" checked={settings.includeRenovate} onChange={event => updateSettings({ includeRenovate: event.target.checked })} /></SettingRow>
          <SettingRow label="Include draft pull requests" description="Drafts contribute to WIP and inventory"><input type="checkbox" checked={settings.includeDraftPullRequests} onChange={event => updateSettings({ includeDraftPullRequests: event.target.checked })} /></SettingRow>
          <SettingRow label="Default analytics range" description="Initial range for historical pages"><select value={settings.defaultRangeDays} onChange={event => updateSettings({ defaultRangeDays: Number(event.target.value) as 30 | 60 | 90 })}><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option></select></SettingRow>
          <SettingRow label="Business timezone" description="Used for business-day calculations"><input value={settings.businessTimezone} onChange={event => updateSettings({ businessTimezone: event.target.value || 'UTC' })} /></SettingRow>
          <SettingRow label="Business days" description="Comma-separated weekday numbers, Sunday = 0"><input value={settings.businessDays.join(',')} onChange={event => updateSettings({ businessDays: event.target.value.split(',').map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6) })} /></SettingRow>
          <SettingRow label="Branch threshold" description="Business hours before an active branch is aging"><input aria-label="Default branch threshold" type="number" min={1} value={settings.branchThresholdHours} onChange={event => updateSettings({ branchThresholdHours: Math.max(1, Number(event.target.value)) })} /></SettingRow>
          <SettingRow label="Inventory aging threshold" description="Business days before inventory becomes aging"><input type="number" min={1} value={settings.inventoryThresholds.agingDays} onChange={event => updateSettings({ inventoryThresholds: { ...settings.inventoryThresholds, agingDays: Math.max(1, Number(event.target.value)) } })} /></SettingRow>
          <SettingRow label="Inventory stale threshold" description="Business days before inventory becomes stale"><input type="number" min={2} value={settings.inventoryThresholds.staleDays} onChange={event => updateSettings({ inventoryThresholds: { ...settings.inventoryThresholds, staleDays: Math.max(settings.inventoryThresholds.agingDays + 1, Number(event.target.value)) } })} /></SettingRow>
          <SettingRow label="Stale default branch" description="Calendar days without integration activity"><input type="number" min={1} value={settings.staleDefaultBranchDays} onChange={event => updateSettings({ staleDefaultBranchDays: Math.max(1, Number(event.target.value)) })} /></SettingRow>
          <SettingRow label="Cache retention" description="Days of normalized local history"><input type="number" min={30} value={settings.cacheRetentionDays} onChange={event => updateSettings({ cacheRetentionDays: Math.max(30, Number(event.target.value)) })} /></SettingRow>
          <SettingRow label="Refresh interval" description="Minutes between background refresh opportunities"><input type="number" min={5} value={settings.refreshIntervalMinutes} onChange={event => updateSettings({ refreshIntervalMinutes: Math.max(5, Number(event.target.value)) })} /></SettingRow>
          <SettingRow label="Release/deployment matching" description="Prefer explicit evidence, then tag or SHA"><select value={settings.releaseDeploymentStrategy} onChange={event => updateSettings({ releaseDeploymentStrategy: event.target.value as typeof settings.releaseDeploymentStrategy })}><option value="explicit">Explicit links only</option><option value="tag_or_sha">Explicit, tag, or SHA</option><option value="disabled">Disabled</option></select></SettingRow>
          <SettingRow label="Minimum percentile sample" description="Required before personalized P75/P90 warnings"><input type="number" min={3} value={settings.minimumPercentileSamples} onChange={event => updateSettings({ minimumPercentileSamples: Math.max(3, Number(event.target.value)) })} /></SettingRow>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>{confirmReset ? <><button type="button" className="analytics-button" onClick={() => setConfirmReset(false)}>Cancel</button><button type="button" className="analytics-button analytics-button--danger" onClick={() => { resetSettings(); setConfirmReset(false); }}>Confirm reset</button></> : <button type="button" className="analytics-button analytics-button--danger" onClick={() => setConfirmReset(true)}>Reset analytics defaults</button>}</div>
        </div>
      </SectionCard>
      <SectionCard title="Repository Overrides" action={<span style={{ color: 'var(--text-secondary)', fontSize: 9 }}>Defaults preserve current behavior</span>}>
        <div className="analytics-repo-settings"><table className="analytics-table"><thead><tr><th>Repository</th><th>Included</th><th>Branch threshold</th><th>Release matching</th><th>Deployment matching</th><th>Default branch</th><th>Capability note</th></tr></thead><tbody>{repositories.map(repository => {
          const effective = effectiveRepositorySettings(settings, repository.id);
          const override = settings.repositoryOverrides[repository.id] ?? {};
          return <tr key={repository.id}><td>{repository.nameWithOwner}</td><td><input aria-label={`Include ${repository.nameWithOwner}`} type="checkbox" checked={effective.included} onChange={event => updateOverride(repository.id, { included: event.target.checked })} /></td><td><input aria-label={`Branch threshold for ${repository.nameWithOwner}`} type="number" min={1} value={override.branchThresholdHours ?? settings.branchThresholdHours} onChange={event => updateOverride(repository.id, { branchThresholdHours: Math.max(1, Number(event.target.value)) })} /></td><td><input aria-label={`Release matching for ${repository.nameWithOwner}`} type="checkbox" checked={override.releaseMatching ?? repository.releaseMatching} onChange={event => updateOverride(repository.id, { releaseMatching: event.target.checked })} /></td><td><input aria-label={`Deployment matching for ${repository.nameWithOwner}`} type="checkbox" checked={override.deploymentMatching ?? repository.deploymentMatching} onChange={event => updateOverride(repository.id, { deploymentMatching: event.target.checked })} /></td><td><input aria-label={`Default branch for ${repository.nameWithOwner}`} value={override.defaultBranch ?? repository.defaultBranch} onChange={event => updateOverride(repository.id, { defaultBranch: event.target.value })} /></td><td><input aria-label={`Capability note for ${repository.nameWithOwner}`} value={override.capabilityNote ?? repository.capabilityNote ?? ''} placeholder="Optional note" onChange={event => updateOverride(repository.id, { capabilityNote: event.target.value })} /></td></tr>;
        })}</tbody></table></div>
        {repositories.length === 0 && <div className="analytics-empty">Repository overrides become available after repository history is loaded.</div>}
      </SectionCard>
    </div>
    <p style={{ color: 'var(--text-muted)', fontSize: 9, margin: '10px 2px' }}>Defaults: {DEFAULT_ANALYTICS_SETTINGS.branchThresholdHours} business-hour branch threshold, {DEFAULT_ANALYTICS_SETTINGS.inventoryThresholds.agingDays}-{DEFAULT_ANALYTICS_SETTINGS.inventoryThresholds.staleDays} day inventory bands, and bounded cached history.</p>
  </AnalyticsPage>;
}
