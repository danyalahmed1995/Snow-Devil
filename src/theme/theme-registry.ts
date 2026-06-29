export const THEME_TOKEN_KEYS = [
  'bgPrimary','bgSecondary','bgTertiary','bgElevated','surface','surfacePanel','surfaceNested','surfaceGlass','surfaceGlassStrong','surfaceHover','surfaceSelected',
  'borderSubtle','borderStandard','borderStrong','borderFocus','textPrimary','textSecondary','textMuted','accent','accentHover','success','warning','danger','info',
  'statusSuccessBg','statusSuccessFg','statusWarningBg','statusWarningFg','statusDangerBg','statusDangerFg','statusInfoBg','statusInfoFg','statusNeutralBg','statusNeutralFg','statusReviewBg','statusReviewFg','statusDraftBg','statusDraftFg','statusApprovedBg','statusApprovedFg','statusChangesRequestedBg','statusChangesRequestedFg','badgeBg','badgeFg','labelBg','labelFg','counterBg','counterFg','selectionBg','selectionFg','disabledBg','disabledFg',
  'shadowSm','shadowMd','shadowLg','shadowFocus','blurPanel','radiusSm','radiusMd','radiusLg','fontUi','fontMono','density','scrollbar','scrollbarHover',
  'syntaxBackground','syntaxText','syntaxKeyword','syntaxString','syntaxNumber','pipelineIssue','pipelineCoding','pipelineReview','pipelineChecks','pipelineDelivery',
] as const;

export type ThemeTokenKey = typeof THEME_TOKEN_KEYS[number];
export type ThemeTokens = Record<ThemeTokenKey, string>;
export type ThemeId = 'snow-devil';

export interface SnowDevilTheme {
  id: ThemeId;
  name: string;
  description: string;
  colorScheme: 'dark';
  swatch: [string, string, string];
  tokens: ThemeTokens;
}

/**
 * The sole product theme. The registry shape remains so a future deliberate
 * theme project does not require replacing the token application boundary.
 */
export const CANONICAL_THEME: SnowDevilTheme = {
  id: 'snow-devil',
  name: 'Snow Devil',
  description: 'The canonical deep-navy Snow Devil desktop system.',
  colorScheme: 'dark',
  swatch: ['#07111f', '#10213a', '#3978ff'],
  tokens: {
    bgPrimary:'#07101d',bgSecondary:'#0a1626',bgTertiary:'#10213a',bgElevated:'#12243d',surface:'#0d1b2e',surfacePanel:'#0a1728',surfaceNested:'#071321',surfaceGlass:'rgba(12,27,47,.88)',surfaceGlassStrong:'rgba(8,20,35,.96)',surfaceHover:'rgba(91,145,255,.11)',surfaceSelected:'rgba(57,120,255,.22)',
    borderSubtle:'rgba(157,190,235,.10)',borderStandard:'rgba(157,190,235,.17)',borderStrong:'rgba(112,162,232,.34)',borderFocus:'#6ba2ff',textPrimary:'#f1f6ff',textSecondary:'#b4c3d9',textMuted:'#7f91aa',accent:'#3978ff',accentHover:'#5d91ff',success:'#4bd16f',warning:'#f3ac2f',danger:'#ff646d',info:'#57a0ff',
    statusSuccessBg:'#123c2c',statusSuccessFg:'#83f19d',statusWarningBg:'#432e0d',statusWarningFg:'#ffc85f',statusDangerBg:'#461b25',statusDangerFg:'#ff8b92',statusInfoBg:'#13335f',statusInfoFg:'#8dbbff',statusNeutralBg:'#1a2a40',statusNeutralFg:'#d9e5f6',statusReviewBg:'#342261',statusReviewFg:'#c6a6ff',statusDraftBg:'#172c49',statusDraftFg:'#b9d4ff',statusApprovedBg:'#123c2c',statusApprovedFg:'#83f19d',statusChangesRequestedBg:'#461b25',statusChangesRequestedFg:'#ff8b92',badgeBg:'#1a2a40',badgeFg:'#d9e5f6',labelBg:'#1d3453',labelFg:'#dceaff',counterBg:'#1a2940',counterFg:'#e9f1ff',selectionBg:'#1b3e78',selectionFg:'#ffffff',disabledBg:'#172437',disabledFg:'#8292a8',
    shadowSm:'0 2px 8px rgba(0,7,18,.28)',shadowMd:'0 12px 32px rgba(0,7,18,.34)',shadowLg:'0 24px 64px rgba(0,5,15,.50)',shadowFocus:'0 0 0 3px rgba(77,137,255,.30)',blurPanel:'14px',radiusSm:'6px',radiusMd:'10px',radiusLg:'14px',fontUi:'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',fontMono:'"Cascadia Code",ui-monospace,SFMono-Regular,Consolas,monospace',density:'.96',scrollbar:'rgba(126,151,184,.42)',scrollbarHover:'#8195af',
    syntaxBackground:'#06101c',syntaxText:'#dce8f8',syntaxKeyword:'#8fb4ff',syntaxString:'#99d8a5',syntaxNumber:'#ffad80',pipelineIssue:'#ff717a',pipelineCoding:'#57a0ff',pipelineReview:'#b48cff',pipelineChecks:'#f3ac2f',pipelineDelivery:'#4bd16f',
  },
};

export const THEMES: readonly SnowDevilTheme[] = [CANONICAL_THEME];
export const DEFAULT_THEME_ID: ThemeId = 'snow-devil';
export const themeById = (id: string | null | undefined) => { void id; return CANONICAL_THEME; };

const CSS_TOKEN_NAMES: Record<ThemeTokenKey,string> = {
  bgPrimary:'--bg-primary',bgSecondary:'--bg-secondary',bgTertiary:'--bg-tertiary',bgElevated:'--bg-elevated',surface:'--surface',surfacePanel:'--surface-panel',surfaceNested:'--surface-nested',surfaceGlass:'--surface-glass',surfaceGlassStrong:'--surface-glass-strong',surfaceHover:'--surface-hover',surfaceSelected:'--surface-selected',borderSubtle:'--border-subtle',borderStandard:'--border-standard',borderStrong:'--border-strong',borderFocus:'--border-focus',textPrimary:'--text-primary',textSecondary:'--text-secondary',textMuted:'--text-muted',accent:'--accent',accentHover:'--accent-hover',success:'--success',warning:'--warning',danger:'--danger',info:'--info',statusSuccessBg:'--status-success-bg',statusSuccessFg:'--status-success-fg',statusWarningBg:'--status-warning-bg',statusWarningFg:'--status-warning-fg',statusDangerBg:'--status-danger-bg',statusDangerFg:'--status-danger-fg',statusInfoBg:'--status-info-bg',statusInfoFg:'--status-info-fg',statusNeutralBg:'--status-neutral-bg',statusNeutralFg:'--status-neutral-fg',statusReviewBg:'--status-review-bg',statusReviewFg:'--status-review-fg',statusDraftBg:'--status-draft-bg',statusDraftFg:'--status-draft-fg',statusApprovedBg:'--status-approved-bg',statusApprovedFg:'--status-approved-fg',statusChangesRequestedBg:'--status-changes-requested-bg',statusChangesRequestedFg:'--status-changes-requested-fg',badgeBg:'--badge-bg',badgeFg:'--badge-fg',labelBg:'--label-bg',labelFg:'--label-fg',counterBg:'--counter-bg',counterFg:'--counter-fg',selectionBg:'--selection-bg',selectionFg:'--selection-fg',disabledBg:'--disabled-bg',disabledFg:'--disabled-fg',shadowSm:'--shadow-sm',shadowMd:'--shadow-md',shadowLg:'--shadow-lg',shadowFocus:'--shadow-focus',blurPanel:'--blur-panel',radiusSm:'--radius-sm',radiusMd:'--radius-md',radiusLg:'--radius-lg',fontUi:'--font-ui',fontMono:'--font-mono',density:'--density',scrollbar:'--scrollbar',scrollbarHover:'--scrollbar-hover',syntaxBackground:'--syntax-bg',syntaxText:'--syntax-text',syntaxKeyword:'--syntax-keyword',syntaxString:'--syntax-string',syntaxNumber:'--syntax-number',pipelineIssue:'--pipeline-issue',pipelineCoding:'--pipeline-coding',pipelineReview:'--pipeline-review',pipelineChecks:'--pipeline-checks',pipelineDelivery:'--pipeline-delivery',
};

export function applyTheme(_themeId: string, root: HTMLElement = document.documentElement) {
  void _themeId;
  root.dataset.theme = CANONICAL_THEME.id;
  root.style.colorScheme = CANONICAL_THEME.colorScheme;
  for (const key of THEME_TOKEN_KEYS) root.style.setProperty(CSS_TOKEN_NAMES[key], CANONICAL_THEME.tokens[key]);
  return CANONICAL_THEME.id;
}
