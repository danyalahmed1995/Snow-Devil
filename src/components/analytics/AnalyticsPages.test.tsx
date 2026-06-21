import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useFlowStore } from '../../stores/flow-store';
import { useModeStore } from '../../stores/mode-store';
import { CIHealthPage } from './CIHealthPage';
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
  });

  it('renders CI health grades, filters, and a selectable repository table', () => {
    renderPage(<CIHealthPage />);
    expect(screen.getByRole('heading', { name: 'CI Health Monitor' })).toBeInTheDocument();
    expect(screen.getByText('excellent')).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(4);
    fireEvent.change(screen.getByLabelText('CI status filter'), { target: { value: 'poor' } });
    expect(screen.getAllByText('nova-labs/old-prototype').some(element => element.tagName === 'TD')).toBe(true);
  });

  it('switches among all historical analytics tabs', () => {
    renderPage(<FlowAnalyticsPage />);
    expect(screen.getByRole('heading', { name: 'Flow Analytics' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Throughput' }));
    expect(screen.getByRole('img', { name: 'Throughput over time' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Lead Time Distribution' }));
    expect(screen.getByLabelText('Lead time distribution')).toBeInTheDocument();
  });

  it('filters inventory and selects an evidence-backed item', () => {
    renderPage(<InventoryPage />);
    expect(screen.getByRole('heading', { name: 'Delivery Inventory' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search inventory'), { target: { value: 'old-renderer' } });
    const row = screen.getByText(/experiment\/old-renderer/).closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(Object.values(useFlowStore.getState().states).some(state => state.selectedAnalyticsEntity?.kind === 'inventory')).toBe(true);
  });

  it('renders focus warnings from the same current-work model', () => {
    renderPage(<PersonalFocusPage />);
    expect(screen.getByRole('heading', { name: 'Personal Focus' })).toBeInTheDocument();
    expect(screen.getByText('Current WIP is meaningfully above your historical norm.')).toBeInTheDocument();
    expect(screen.getByText('Focus Tip')).toBeInTheDocument();
  });

  it('persists settings and requires explicit reset confirmation', () => {
    renderPage(<AnalyticsSettingsPage />);
    fireEvent.change(screen.getByLabelText('Default branch threshold'), { target: { value: '24' } });
    expect(useAnalyticsSettingsStore.getState().settings.branchThresholdHours).toBe(24);
    fireEvent.click(screen.getByRole('button', { name: 'Reset analytics defaults' }));
    expect(screen.getByRole('button', { name: 'Confirm reset' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reset' }));
    expect(useAnalyticsSettingsStore.getState().settings.branchThresholdHours).toBe(16);
  });
});
