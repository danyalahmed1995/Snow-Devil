import { THEMES, type ThemeId } from '../../theme/theme-registry';
import { useThemeStore } from '../../stores/theme-store';

export function ThemeSelect({ compact = false }: { compact?: boolean }) {
  const themeId = useThemeStore(state => state.themeId);
  const setTheme = useThemeStore(state => state.setTheme);
  return <div className={compact ? 'theme-select theme-select--compact' : 'theme-select'}><span>Theme</span><select aria-label="Theme" value={themeId} onChange={event => setTheme(event.target.value as ThemeId)}>{THEMES.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></div>;
}
