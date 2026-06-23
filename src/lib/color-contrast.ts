export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export function parseHexColor(value: string | null | undefined): RgbColor | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return {
      r: parseInt(trimmed[0] + trimmed[0], 16),
      g: parseInt(trimmed[1] + trimmed[1], 16),
      b: parseInt(trimmed[2] + trimmed[2], 16),
    };
  }
  if (!/^[0-9a-fA-F]{6}$/.test(trimmed)) return null;
  return {
    r: parseInt(trimmed.slice(0, 2), 16),
    g: parseInt(trimmed.slice(2, 4), 16),
    b: parseInt(trimmed.slice(4, 6), 16),
  };
}

export function toHexColor(color: RgbColor): string {
  return `#${[color.r, color.g, color.b].map(channel => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`;
}

const linearize = (channel: number) => {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

export function relativeLuminance(color: RgbColor): number {
  return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b);
}

export function contrastRatio(foreground: RgbColor, background: RgbColor): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function chooseReadableForeground(background: RgbColor, minimumRatio = 4.5): string {
  const light = parseHexColor('#ffffff')!;
  const dark = parseHexColor('#000000')!;
  const lightRatio = contrastRatio(light, background);
  const darkRatio = contrastRatio(dark, background);
  if (lightRatio >= minimumRatio || lightRatio >= darkRatio) return '#ffffff';
  return '#000000';
}

export function githubLabelStyle(color: string | null | undefined): { backgroundColor: string; color: string; borderColor: string } {
  const background = parseHexColor(color) ?? parseHexColor('#555555')!;
  const backgroundColor = toHexColor(background);
  const foreground = chooseReadableForeground(background);
  const borderColor = contrastRatio(parseHexColor(foreground)!, background) >= 7
    ? backgroundColor
    : foreground === '#ffffff'
      ? 'rgba(255, 255, 255, 0.42)'
      : 'rgba(0, 0, 0, 0.28)';
  return { backgroundColor, color: foreground, borderColor };
}
