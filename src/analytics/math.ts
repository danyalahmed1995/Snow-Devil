export function percentile(values: number[], requestedPercentile: number): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const p = Math.max(0, Math.min(100, requestedPercentile));
  const index = (p / 100) * (finite.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return finite[lower];
  return finite[lower] + (finite[upper] - finite[lower]) * (index - lower);
}

export function median(values: number[]): number | null {
  return percentile(values, 50);
}

export function detectOutliers(values: number[]): number[] {
  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  if (q1 == null || q3 == null) return [];
  const upperFence = q3 + (q3 - q1) * 1.5;
  return values.filter(value => value > upperFence);
}

export function formatDurationHours(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return 'Unknown';
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
