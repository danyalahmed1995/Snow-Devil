import { describe, expect, it } from 'vitest';
import { responsiveFlowPlotWidth } from './FlowAnalyticsPage';

describe('responsive cumulative Flow chart width', () => {
  it('uses the measured container width without a fixed maximum', () => {
    expect(responsiveFlowPlotWidth(640)).toBe(640);
    expect(responsiveFlowPlotWidth(1180)).toBe(1180);
    expect(responsiveFlowPlotWidth(1640)).toBe(1640);
  });

  it('keeps a safe minimum and a deterministic pre-measure fallback', () => {
    expect(responsiveFlowPlotWidth(120)).toBe(320);
    expect(responsiveFlowPlotWidth(0)).toBe(1000);
  });
});
