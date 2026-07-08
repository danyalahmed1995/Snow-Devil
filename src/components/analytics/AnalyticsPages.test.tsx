import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useFlowStore } from '../../stores/flow-store';
import { useFocusPreferencesStore } from '../../stores/focus-preferences-store';
import { useModeStore } from '../../stores/mode-store';
import { CIActivityPage } from './CIActivityPage';
import { FlowAnalyticsPage } from './FlowAnalyticsPage';
import { InventoryPage } from './InventoryPage';
import { PersonalFocusPage } from './PersonalFocusPage';
import { AnalyticsSettingsPage } from './AnalyticsSettingsPage';

function renderPage(page: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
}

describe('individual analytics pages in Demo Mode', () => {
  beforeEach(() => {
    useModeStore.setState({ mode: 'demo', demoRevision: 0 });
    useAnalyticsSettingsStore.getState().resetSettings();
    useFlowStore.setState({ states: {} });
    useFocusPreferencesStore.setState({ dismissed: [], irrelevant: [], snoozedUntil: {} });
  });

  it('renders CI Activity with summary metrics', () => {
    renderPage(<CIActivityPage />);
    expect(screen.getByRole('heading', { name: 'CI Activity' })).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Status filter'));
    fireEvent.click(screen.getByRole('option', { name: 'Failed' }));
  });

  it('switches among all historical analytics tabs', () => {
    renderPage(<FlowAnalyticsPage />);
    expect(screen.getByRole('heading', { name: 'Flow Analytics' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Throughput' }));
    expect(screen.getByRole('img', { name: 'Throughput over time' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Lead Time Distribution' }));
    expect(screen.getByLabelText('Lead time distribution')).toBeInTheDocument();
  });

  it('filters Delivery Risks and selects an evidence-backed item', () => {
    renderPage(<InventoryPage />);
    expect(screen.getByRole('heading', { name: 'Delivery Risks' })).toBeInTheDocument();
    expect(screen.queryByText(/experiment\/old-renderer/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Saved Delivery Risks views'));
    fireEvent.click(screen.getByRole('option', { name: 'Human Stale Work' }));
    fireEvent.click(screen.getByLabelText('Delivery Risks repository scope'));
    fireEvent.click(screen.getByRole('option', { name: 'All accessible repositories' }));
    fireEvent.change(screen.getByLabelText('Search delivery risks'), { target: { value: 'old-renderer' } });
    const row = screen.getByText(/experiment\/old-renderer/).closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(Object.values(useFlowStore.getState().states).some(state => state.selectedAnalyticsEntity?.kind === 'inventory')).toBe(true);
  });

  it('defaults focus to current direct human responsibility', () => {
    renderPage(<PersonalFocusPage />);
    expect(screen.getByRole('heading', { name: 'Personal Focus' })).toBeInTheDocument();
    expect(screen.getByLabelText('Focus involvement')).toHaveTextContent('Direct responsibility');
    expect(screen.getByLabelText('Focus actor')).toHaveTextContent('Humans only');
    expect(screen.getByRole('heading', { name: 'Do now' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waiting on others' })).toBeInTheDocument();
    expect(screen.getByText('Next action')).toBeInTheDocument();
    expect(screen.queryByText('Bump vite from 7.3.4 to 7.3.5')).not.toBeInTheDocument();
  });

  it('persists settings and requires explicit reset confirmation', () => {
    renderPage(<AnalyticsSettingsPage />);
    fireEvent.change(screen.getByLabelText('Default branch threshold'), { target: { value: '24' } });
    expect(useAnalyticsSettingsStore.getState().settings.branchThresholdHours).toBe(24);
    fireEvent.click(screen.getByRole('button', { name: 'Reset analytics defaults' }));
    expect(screen.getByRole('button', { name: 'Confirm reset' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reset' }));
    expect(useAnalyticsSettingsStore.getState().settings.branchThresholdHours).toBe(16);
    fireEvent.click(screen.getByRole('button', { name: 'Full local reset…' }));
    const destructive = screen.getByRole('button', { name: 'Delete all local data' });
    expect(destructive).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type RESET/), { target: { value: 'RESET' } });
    expect(destructive).toBeEnabled();
  });
});
