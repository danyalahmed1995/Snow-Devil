import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it } from 'vitest';
import { ThemeSelect } from './ThemeSelect';import { useThemeStore } from '../../stores/theme-store';
describe('shared theme selectors',()=>{beforeEach(()=>useThemeStore.setState({themeId:'dark-glass'}));it('top-right and Settings-style selectors share one preference',()=>{render(<><ThemeSelect/><ThemeSelect/></>);const selects=screen.getAllByLabelText('Theme');fireEvent.click(selects[0]);fireEvent.click(screen.getByRole('option',{name:/Deep Navy/}));expect(selects[1]).toHaveTextContent('Deep Navy');expect(useThemeStore.getState().themeId).toBe('deep-navy');});});
