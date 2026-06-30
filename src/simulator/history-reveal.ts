export function centeredHistoryScrollTop(input: {
  scrollTop: number;
  containerTop: number;
  containerHeight: number;
  rowTop: number;
  rowHeight: number;
}): number {
  const rowTopInContent = input.scrollTop + input.rowTop - input.containerTop;
  return Math.max(0, rowTopInContent - Math.max(0, (input.containerHeight - input.rowHeight) / 2));
}
