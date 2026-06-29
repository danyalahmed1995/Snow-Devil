import { THEMES, type ThemeId } from '../../theme/theme-registry';
import { useThemeStore } from '../../stores/theme-store';
import { Select } from '../ui/Select';

export function ThemeSelect({ compact = false }: { compact?: boolean }) {
  const themeId = useThemeStore(state => state.themeId);
  const setTheme = useThemeStore(state => state.setTheme);
  return <div className={compact ? 'theme-select theme-select--compact' : 'theme-select'}><span>Theme</span><Select ariaLabel="Theme" value={themeId} onChange={value => setTheme(value as ThemeId)} options={THEMES.map(theme => ({ value: theme.id, label: theme.name, description: theme.description }))} /></div>;
}
