import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it } from 'vitest';
import { applyTheme } from '../../theme/theme-registry';
import { useTabsStore } from '../../stores/tabs-store';
import { WorkspaceTabStrip } from './WorkspaceTabStrip';

const now=Date.now();
const home={id:'native:home',family:'native' as const,kind:'home' as const,title:'Home',pinned:true,closable:false,createdAt:now,lastActivatedAt:now};
const longAccount={id:'github:profile',family:'browser' as const,kind:'profile' as const,title:'Account danyalahmed1995 with an extraordinarily long GitHub title',canonicalUrl:'https://github.com/danyalahmed1995',currentUrl:'https://github.com/danyalahmed1995',history:['https://github.com/danyalahmed1995'],historyIndex:0,lifecycle:'resident' as const,pinned:false,closable:true,createdAt:now,lastActivatedAt:now};

describe('workspace tab close controls',()=>{
  beforeEach(()=>{applyTheme('dark-glass');useTabsStore.setState({tabs:[home,{id:'native:long',family:'native',kind:'flow',title:'An extraordinarily long account simulator title that must truncate before close',pinned:false,closable:true,createdAt:now,lastActivatedAt:now}],activeTabId:'native:long'});});
  it('keeps a separately labelled close target beside a truncating title',()=>{render(<WorkspaceTabStrip/>);const close=screen.getByRole('button',{name:'Close An extraordinarily long account simulator title that must truncate before close'});expect(close).toBeInTheDocument();expect(close.closest('.workspace-tab')?.querySelector('.workspace-tab__title')).toHaveTextContent('An extraordinarily long');fireEvent.click(close);expect(useTabsStore.getState().tabs.map(tab=>tab.id)).toEqual(['native:home']);});
  it('supports middle-click close on the tab surface',()=>{render(<WorkspaceTabStrip/>);fireEvent(screen.getByRole('tab',{name:/An extraordinarily long/}),new MouseEvent('auxclick',{button:1,bubbles:true}));expect(useTabsStore.getState().tabs).toHaveLength(1);});
  it('renders a visible close control for the active Account browser tab',()=>{useTabsStore.setState({tabs:[home,longAccount],activeTabId:'github:profile'});render(<WorkspaceTabStrip/>);expect(screen.queryByRole('button',{name:'Close Home'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Close Account danyalahmed1995 with an extraordinarily long GitHub title'})).toBeInTheDocument();});
  it('keeps Account close controls available after switching to a light theme',()=>{useTabsStore.setState({tabs:[home,longAccount],activeTabId:'github:profile'});applyTheme('frosted-light');render(<WorkspaceTabStrip/>);const close=screen.getByRole('button',{name:'Close Account danyalahmed1995 with an extraordinarily long GitHub title'});expect(close).toBeVisible();expect(close.closest('.workspace-tab')?.querySelector('.workspace-tab__title')).toHaveTextContent('Account danyalahmed1995');});
});
