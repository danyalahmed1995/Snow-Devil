import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

export const MAX_INACTIVE_QUERY_ENTRIES = 100;

queryClient.getQueryCache().subscribe(event => {
  if (event.type !== 'updated' || event.action.type !== 'success') return;
  const inactive = queryClient.getQueryCache().getAll()
    .filter(query => query.getObserversCount() === 0)
    .sort((a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt);
  const excess = inactive.length - MAX_INACTIVE_QUERY_ENTRIES;
  for (const query of inactive.slice(0, Math.max(0, excess))) {
    queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
  }
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
