import { useState } from 'react';
import { includedRepositories } from '../../analytics/selectors';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSync } from '../../hooks/useAnalyticsSync';
import { DEFAULT_ANALYTICS_SETTINGS, effectiveRepositorySettings, useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { AnalyticsPage, AnalyticsState, SectionCard, useAnalyticsTabRefresh } from './AnalyticsShared';
import { ThemeSelect } from '../theme/ThemeSelect';
import '../theme/Theme.css';
import { useAuthStore } from '../../stores/auth-store';
import { resetLocalCache } from '../../services/reset-local-cache';
import { resetLocalAppData } from '../../services/reset-local-app-data';
import { AuthModal } from '../auth/AuthModal';
import { Select } from '../ui/Select';

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return <div className="analytics-setting-row"><span>{label}<small>{description}</small></span><div className="analytics-setting-control">{children}</div></div>;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseJsonArray(value?: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonCounts(value?: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

export function AnalyticsSettingsPage() {
  const analytics = useAnalyticsData();
  const sync = useAnalyticsSync();
  useAnalyticsTabRefresh(async () => { await Promise.all([analytics.refetch(), sync.refresh()]); });
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const updateSettings = useAnalyticsSettingsStore(state => state.updateSettings);
  const updateOverride = useAnalyticsSettingsStore(state => state.updateRepositoryOverride);
  const resetSettings = useAnalyticsSettingsStore(state => state.resetSettings);
  const [confirmDefaults, setConfirmDefaults] = useState(false);
  const [confirmFullReset, setConfirmFullReset] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [showAllRepositories, setShowAllRepositories] = useState(false);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string>();
  const session = useAuthStore(state => state.session);
  const disconnect = useAuthStore(state => state.disconnect);
  const repositories = analytics.data?.repositories ?? [];
  const includedCount = analytics.data ? includedRepositories(analytics.data, settings).length : 0;
  const overrideRepositories = repositories.filter(repository => (showAllRepositories || settings.repositoryOverrides[repository.id]) && repository.nameWithOwner.toLowerCase().includes(repoSearch.toLowerCase()));
  const selectedRepository = repositories.find(repository => repository.id === selectedRepositoryId) ?? overrideRepositories[0];
  const selectedOverride = selectedRepository ? settings.repositoryOverrides[selectedRepository.id] ?? {} : {};
  const selectedEffective = selectedRepository ? effectiveRepositorySettings(settings, selectedRepository.id) : undefined;
  const failedRepositories = parseJsonArray(sync.state?.failed_repositories_json);
  const counts = parseJsonCounts(sync.state?.counts_json);

  const updateBusinessDay = (day: number) => updateSettings({ businessDays: settings.businessDays.includes(day) ? settings.businessDays.filter(value => value !== day) : [...settings.businessDays, day].sort() });

  return <AnalyticsPage title="Settings" description="Global application, account, data, analytics defaults, and repository-specific evidence settings" demo={analytics.mode === 'demo'} controls={<span className="settings-autosave">Changes save automatically</span>}>
    <AnalyticsState loading={analytics.isLoading} error={analytics.error} partialReasons={[]} onRetry={() => void analytics.refetch()} />
    <div className="analytics-settings analytics-settings--sections">
      <SectionCard title="General" action={<span className="analytics-status analytics-status--healthy">Auto-save</span>}><div className="analytics-settings-group">
        <SettingRow label="Application behavior" description="Settings apply across live and demo workspaces.">Snow Devil keeps tabs and preferences across restart.</SettingRow>
        <SettingRow label="Reduced motion" description="Minimizes animated transitions and smooth scrolling throughout the app."><input type="checkbox" checked={settings.reducedMotion} onChange={event => updateSettings({ reducedMotion: event.target.checked })} /></SettingRow>
      </div></SectionCard>

      <SectionCard title="Appearance" action={<span className="analytics-status analytics-status--healthy">Global</span>}><div className="analytics-settings-group"><SettingRow label="Snow Devil theme" description="Shared by all native screens and overlays."><ThemeSelect /></SettingRow></div></SectionCard>

      <SectionCard title="Account & Data" action={<span className={`analytics-status analytics-status--${session.status === 'connected' ? 'excellent' : 'warning'}`}>{session.status}</span>}><div className="analytics-settings-group">
        <SettingRow label="GitHub account" description={session.status === 'connected' ? `Connected as ${session.account.login}` : 'Connect or reconnect an individual GitHub account.'}><div className="settings-action-row">{session.status === 'connected' ? <><button className="analytics-button" onClick={() => void disconnect().then(() => setLifecycleStatus('Signed out. Private tabs and account-scoped selections were cleared.'))}>Sign out</button><button className="analytics-button" onClick={() => void disconnect().then(() => setShowAuth(true))}>Switch account</button></> : <button className="analytics-button analytics-button--primary" onClick={() => setShowAuth(true)}>{session.status === 'error' ? 'Reconnect GitHub' : 'Sign in'}</button>}</div></SettingRow>
        <SettingRow label="Reset local cache" description="Deletes synchronized GitHub records, simulator history, and derived analytics. Preserves credentials, settings, and restored tabs."><button className="analytics-button" onClick={() => { setLifecycleStatus('Clearing local cache…'); void resetLocalCache().then(() => setLifecycleStatus('Local cache cleared. Credentials, settings, and tabs were preserved.')).catch(() => setLifecycleStatus('Local cache reset failed.')); }}>Reset local cache</button></SettingRow>
        <SettingRow label="Full local reset" description="Deletes Snow Devil credentials, embedded browser data, cached GitHub data, restored tabs, simulator state, analytics, and preferences."><button className="analytics-button analytics-button--danger" onClick={() => setConfirmFullReset(true)}>Full local reset…</button></SettingRow>
        {lifecycleStatus && <p className="settings-lifecycle-status" aria-live="polite">{lifecycleStatus}</p>}
      </div></SectionCard>

      <SectionCard title="Data Inclusion" action={<span className="analytics-status analytics-status--healthy">{includedCount} included</span>}><div className="analytics-settings-group">
        <h3 className="settings-subheading">Repositories</h3>
        <SettingRow label="Include archived" description="Archived repositories are excluded by default."><input type="checkbox" checked={settings.includeArchived} onChange={event => updateSettings({ includeArchived: event.target.checked })} /></SettingRow>
        <SettingRow label="Include forks" description="Forks are excluded from personal baselines by default."><input type="checkbox" checked={settings.includeForks} onChange={event => updateSettings({ includeForks: event.target.checked })} /></SettingRow>
        <SettingRow label="Include private" description="Uses private history only when the connected account can access it."><input type="checkbox" checked={settings.includePrivate} onChange={event => updateSettings({ includePrivate: event.target.checked })} /></SettingRow>
        <h3 className="settings-subheading">Actors</h3>
        <SettingRow label="Include automated work" description="Master switch for all bot-authored work. Specific bot switches apply only when enabled."><input type="checkbox" checked={settings.includeBots} onChange={event => updateSettings({ includeBots: event.target.checked })} /></SettingRow>
        <SettingRow label="Dependabot" description="Dependency updates authored by Dependabot."><input type="checkbox" disabled={!settings.includeBots} checked={settings.includeDependabot} onChange={event => updateSettings({ includeDependabot: event.target.checked })} /></SettingRow>
        <SettingRow label="Renovate" description="Dependency updates authored by Renovate."><input type="checkbox" disabled={!settings.includeBots} checked={settings.includeRenovate} onChange={event => updateSettings({ includeRenovate: event.target.checked })} /></SettingRow>
        <SettingRow label="Other bots" description="Other actors identified as GitHub Apps or bot accounts."><input type="checkbox" disabled={!settings.includeBots} checked={settings.includeOtherBots} onChange={event => updateSettings({ includeOtherBots: event.target.checked })} /></SettingRow>
        <h3 className="settings-subheading">Work</h3>
        <SettingRow label="Include draft pull requests" description="Drafts may contribute to Coding, WIP, and stale-draft inventory."><input type="checkbox" checked={settings.includeDraftPullRequests} onChange={event => updateSettings({ includeDraftPullRequests: event.target.checked })} /></SettingRow>
      </div></SectionCard>

      <SectionCard title="Analytics Defaults"><div className="analytics-settings-group">
        <SettingRow label="Default analytics range" description="Initial historical range."><Select ariaLabel="Default analytics range" value={String(settings.defaultRangeDays)} onChange={value => updateSettings({ defaultRangeDays: Number(value) as 30 | 60 | 90 })} options={[30, 60, 90].map(value => ({ value: String(value), label: `${value} days` }))} /></SettingRow>
        <SettingRow label="Business timezone" description="IANA timezone used for business-day and boundary calculations."><input value={settings.businessTimezone} onChange={event => updateSettings({ businessTimezone: event.target.value || 'UTC' })} /></SettingRow>
        <SettingRow label="Business days" description="Weekdays included in business-time calculations."><div className="settings-weekdays">{WEEKDAYS.map((label, day) => <button type="button" key={label} aria-pressed={settings.businessDays.includes(day)} className={settings.businessDays.includes(day) ? 'is-active' : ''} onClick={() => updateBusinessDay(day)}>{label}</button>)}</div></SettingRow>
        <SettingRow label="Branch age threshold" description="Business hours before an active non-default branch is over threshold."><input aria-label="Default branch threshold" type="number" min={1} max={720} value={settings.branchThresholdHours} onChange={event => updateSettings({ branchThresholdHours: Math.max(1, Math.min(720, Number(event.target.value))) })} /><span className="settings-unit">business hours</span></SettingRow>
        <SettingRow label="Inventory aging threshold" description="Business days before inventory becomes aging."><input type="number" min={1} max={365} value={settings.inventoryThresholds.agingDays} onChange={event => updateSettings({ inventoryThresholds: { ...settings.inventoryThresholds, agingDays: Math.max(1, Math.min(settings.inventoryThresholds.staleDays - 1, Number(event.target.value))) } })} /><span className="settings-unit">business days</span></SettingRow>
        <SettingRow label="Inventory stale threshold" description="Business days before inventory becomes stale."><input type="number" min={2} max={730} value={settings.inventoryThresholds.staleDays} onChange={event => updateSettings({ inventoryThresholds: { ...settings.inventoryThresholds, staleDays: Math.max(settings.inventoryThresholds.agingDays + 1, Math.min(730, Number(event.target.value))) } })} /><span className="settings-unit">business days</span></SettingRow>
        <SettingRow label="Stale default branch" description="Calendar days without integration activity."><input type="number" min={1} max={365} value={settings.staleDefaultBranchDays} onChange={event => updateSettings({ staleDefaultBranchDays: Math.max(1, Math.min(365, Number(event.target.value))) })} /><span className="settings-unit">calendar days</span></SettingRow>
        <SettingRow label="Cache retention" description="Maximum normalized local history."><input type="number" min={30} max={730} value={settings.cacheRetentionDays} onChange={event => updateSettings({ cacheRetentionDays: Math.max(30, Math.min(730, Number(event.target.value))) })} /><span className="settings-unit">days</span></SettingRow>
        <SettingRow label="Refresh interval" description="Minutes between background refresh opportunities."><input type="number" min={5} max={1440} value={settings.refreshIntervalMinutes} onChange={event => updateSettings({ refreshIntervalMinutes: Math.max(5, Math.min(1440, Number(event.target.value))) })} /><span className="settings-unit">minutes</span></SettingRow>
        <SettingRow label="Minimum percentile sample" description="Items required before P75/P90 metrics are shown."><input type="number" min={3} max={1000} value={settings.minimumPercentileSamples} onChange={event => updateSettings({ minimumPercentileSamples: Math.max(3, Math.min(1000, Number(event.target.value))) })} /><span className="settings-unit">items</span></SettingRow>
        <SettingRow label="Release matching" description="Explicit is highest confidence. Tag/SHA matching is labelled matched or inferred."><Select ariaLabel="Release matching strategy" value={settings.releaseMatchingStrategy} onChange={value => updateSettings({ releaseMatchingStrategy: value as typeof settings.releaseMatchingStrategy })} options={[{ value: 'explicit', label: 'Explicit links only', description: 'Highest confidence' }, { value: 'tag_or_sha', label: 'Explicit, tag, or SHA', description: 'May produce matched/inferred evidence' }, { value: 'disabled', label: 'Disabled', description: 'Release metrics become unavailable' }]} /></SettingRow>
        <SettingRow label="Deployment matching" description="Explicit is highest confidence. Environment/SHA matching is labelled matched or inferred."><Select ariaLabel="Deployment matching strategy" value={settings.deploymentMatchingStrategy} onChange={value => updateSettings({ deploymentMatchingStrategy: value as typeof settings.deploymentMatchingStrategy })} options={[{ value: 'explicit', label: 'Explicit links only', description: 'Highest confidence' }, { value: 'environment_or_sha', label: 'Explicit, environment, or SHA', description: 'May produce matched/inferred evidence' }, { value: 'disabled', label: 'Disabled', description: 'Deployment metrics become unavailable' }]} /></SettingRow>
        <div className="settings-reset-row">{confirmDefaults ? <><button type="button" className="analytics-button" onClick={() => setConfirmDefaults(false)}>Cancel</button><button type="button" className="analytics-button analytics-button--danger" onClick={() => { resetSettings(); setConfirmDefaults(false); }}>Confirm reset</button></> : <button type="button" className="analytics-button analytics-button--danger" onClick={() => setConfirmDefaults(true)}>Reset analytics defaults</button>}</div>
      </div></SectionCard>

      <SectionCard title="Repository Overrides" action={<label className="settings-inline-check"><input type="checkbox" checked={showAllRepositories} onChange={event => setShowAllRepositories(event.target.checked)} /> Show repositories without overrides</label>}>
        <div className="settings-overrides">
          <aside><input aria-label="Search repository overrides" value={repoSearch} onChange={event => setRepoSearch(event.target.value)} placeholder="Search repositories…" /><div className="settings-repo-list">{overrideRepositories.slice(0, 250).map(repository => <button type="button" className={selectedRepository?.id === repository.id ? 'is-selected' : ''} key={repository.id} onClick={() => setSelectedRepositoryId(repository.id)}><strong>{repository.nameWithOwner}</strong><small>{settings.repositoryOverrides[repository.id] ? 'Override present' : 'Inherited defaults'} · {repository.releaseMatching || repository.deploymentMatching ? 'Evidence capable' : 'Capability unknown'}</small></button>)}</div></aside>
          <div className="settings-override-detail">{selectedRepository && selectedEffective ? <><header><h3>{selectedRepository.nameWithOwner}</h3><button className="analytics-button" onClick={() => updateSettings({ repositoryOverrides: Object.fromEntries(Object.entries(settings.repositoryOverrides).filter(([id]) => id !== selectedRepository.id)) })}>Reset to global defaults</button></header>
            <SettingRow label="Included" description={`Inherited: ${!settings.ignoredRepositories.includes(selectedRepository.id) ? 'included' : 'excluded'}`}><input type="checkbox" checked={selectedEffective.included} onChange={event => updateOverride(selectedRepository.id, { included: event.target.checked })} /></SettingRow>
            <SettingRow label="Branch threshold" description={selectedOverride.branchThresholdHours == null ? `Inherited: ${settings.branchThresholdHours}` : 'Explicit override'}><input type="number" min={1} value={selectedOverride.branchThresholdHours ?? settings.branchThresholdHours} onChange={event => updateOverride(selectedRepository.id, { branchThresholdHours: Math.max(1, Number(event.target.value)) })} /></SettingRow>
            <SettingRow label="Release evidence" description={selectedOverride.releaseMatching == null ? `Detected: ${selectedRepository.releaseMatching ? 'supported' : 'unknown/unsupported'}` : 'Explicit override'}><input type="checkbox" checked={selectedOverride.releaseMatching ?? selectedRepository.releaseMatching} onChange={event => updateOverride(selectedRepository.id, { releaseMatching: event.target.checked })} /></SettingRow>
            <SettingRow label="Deployment evidence" description={selectedOverride.deploymentMatching == null ? `Detected: ${selectedRepository.deploymentMatching ? 'supported' : 'unknown/unsupported'}` : 'Explicit override'}><input type="checkbox" checked={selectedOverride.deploymentMatching ?? selectedRepository.deploymentMatching} onChange={event => updateOverride(selectedRepository.id, { deploymentMatching: event.target.checked })} /></SettingRow>
            <SettingRow label="Default branch" description={selectedOverride.defaultBranch == null ? `Detected: ${selectedRepository.defaultBranch}` : 'Explicit override'}><input value={selectedOverride.defaultBranch ?? selectedRepository.defaultBranch} onChange={event => updateOverride(selectedRepository.id, { defaultBranch: event.target.value })} /></SettingRow>
            <SettingRow label="Capability note" description="Explain unsupported or unusual evidence configuration."><input value={selectedOverride.capabilityNote ?? selectedRepository.capabilityNote ?? ''} placeholder="Optional note" onChange={event => updateOverride(selectedRepository.id, { capabilityNote: event.target.value })} /></SettingRow>
          </> : <div className="analytics-empty">No repository override is selected. Enable “Show repositories without overrides” to create one.</div>}</div>
        </div>
      </SectionCard>

      <SectionCard title="Data & Sync" action={<button className="analytics-button" disabled={!sync.available || sync.syncing} onClick={() => void sync.sync()}>{sync.syncing ? 'Refreshing…' : 'Refresh data'}</button>}><div className="settings-sync-grid">
        <span>Accessible<strong>{counts.accessible_repositories ?? counts.repositories ?? repositories.length}</strong></span><span>Included<strong>{includedCount}</strong></span><span>Eligible<strong>{counts.eligible_repositories ?? counts.repositories ?? includedCount}</strong></span><span>Complete<strong>{sync.state ? parseListLength(sync.state.completed_repositories_json) : 0}</strong></span><span>Failed<strong>{failedRepositories.length}</strong></span><span>Skipped / unsupported<strong>{(counts.skipped_repositories ?? 0) + (counts.release_unsupported ?? 0) + (counts.deployment_unsupported ?? 0)}</strong></span>
        <p>Last successful sync: {sync.state?.last_successful_at ? new Date(sync.state.last_successful_at).toLocaleString() : 'Never'}</p><p>Cached history: {sync.state?.coverage_start ? `${new Date(sync.state.coverage_start).toLocaleDateString()} – ${sync.state.coverage_end ? new Date(sync.state.coverage_end).toLocaleDateString() : 'current'}` : 'Unavailable'}</p><p>Next refresh: {sync.state?.last_successful_at ? new Date(new Date(sync.state.last_successful_at).getTime() + settings.refreshIntervalMinutes * 60000).toLocaleString() : 'After first successful sync'}</p>
        {failedRepositories.length > 0 && <pre>{failedRepositories.map(value => JSON.stringify(value)).join('\n')}</pre>}
      </div></SectionCard>
    </div>
    <p className="settings-default-note">Defaults: {DEFAULT_ANALYTICS_SETTINGS.branchThresholdHours} business-hour branch threshold, {DEFAULT_ANALYTICS_SETTINGS.inventoryThresholds.agingDays}–{DEFAULT_ANALYTICS_SETTINGS.inventoryThresholds.staleDays} business-day inventory bands, and bounded cached history.</p>
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    {confirmFullReset && <div className="modal-overlay"><section className="modal-content glass-panel-strong" role="dialog" aria-modal="true" aria-label="Confirm full local reset"><h2>Delete all Snow Devil local data?</h2><p>This removes OAuth credentials, embedded browser data, restored tabs, preferences, synchronized GitHub records, simulator history, and analytics caches.</p><label>Type <strong>RESET</strong> to continue<input autoFocus value={resetPhrase} onChange={event => setResetPhrase(event.target.value)} /></label><div className="modal-actions"><button className="btn-secondary" onClick={() => { setConfirmFullReset(false); setResetPhrase(''); }}>Cancel</button><button className="analytics-button analytics-button--danger" disabled={resetPhrase !== 'RESET'} onClick={() => void resetLocalAppData()}>Delete all local data</button></div></section></div>}
  </AnalyticsPage>;
}

function parseListLength(value: string): number {
  try { const parsed: unknown = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.length : 0; } catch { return 0; }
}
