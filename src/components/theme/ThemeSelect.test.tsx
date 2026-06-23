import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it } from 'vitest';
import { ThemeSelect } from './ThemeSelect';import { useThemeStore } from '../../stores/theme-store';
describe('shared theme selectors',()=>{beforeEach(()=>useThemeStore.setState({themeId:'dark-glass'}));it('top-right and Settings-style selectors share one preference',()=>{render(<><ThemeSelect/><ThemeSelect/></>);const selects=screen.getAllByLabelText('Theme') as HTMLSelectElement[];fireEvent.change(selects[0],{target:{value:'deep-navy'}});expect(selects[1].value).toBe('deep-navy');expect(useThemeStore.getState().themeId).toBe('deep-navy');});});
