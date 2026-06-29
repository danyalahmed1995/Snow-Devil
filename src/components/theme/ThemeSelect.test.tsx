import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalyticsSettingsPage } from '../analytics/AnalyticsSettingsPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('single-theme product UI', () => {
  it('does not expose a theme-selection control in Settings', () => {
    render(<QueryClientProvider client={new QueryClient()}><AnalyticsSettingsPage /></QueryClientProvider>);
    expect(screen.queryByLabelText('Theme')).not.toBeInTheDocument();
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument();
  });
});
