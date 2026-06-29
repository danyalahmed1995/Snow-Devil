import { beforeEach,describe,expect,it } from 'vitest';
import { sanitizeSavedViews, useSavedViewsStore } from './saved-views-store';
import { useFlowStore } from './flow-store';
describe('personal saved views',()=>{beforeEach(()=>{localStorage.clear();useSavedViewsStore.setState({views:[]})});it('saves only reusable Flow state and supports lifecycle operations',()=>{const current=useFlowStore.getState().getTabState('test');const view=useSavedViewsStore.getState().save('Failed checks',{...current,search:'checks:failure',selectedItemId:'private-selection'});expect(view.state.search).toBe('checks:failure');expect(view.state.selectedItemId).toBeUndefined();useSavedViewsStore.getState().setPinned(view.id,true);expect(useSavedViewsStore.getState().views[0].pinned).toBe(true);const copy=useSavedViewsStore.getState().duplicate(view.id);expect(copy?.id).not.toBe(view.id);useSavedViewsStore.getState().rename(view.id,'CI focus');expect(useSavedViewsStore.getState().views[0].name).toBe('CI focus');useSavedViewsStore.getState().remove(view.id);expect(useSavedViewsStore.getState().views).toHaveLength(1)})});

describe('saved view hydration',()=>{
  it('isolates malformed records and migrates an older valid record',()=>{
    const views=sanitizeSavedViews([null,{id:'old',name:' Legacy ',state:{scope:'account',search:'is:open'},pinned:true,createdAt:1,updatedAt:2},{id:42,name:'broken',state:{}}]);
    expect(views).toHaveLength(1);expect(views[0]).toMatchObject({id:'old',name:'Legacy',screen:'flow',pinned:true,state:{scope:'account',search:'is:open'}});
  });
  it('keeps a missing repository recoverable instead of crashing hydration',()=>{
    const [view]=sanitizeSavedViews([{id:'repo',name:'Missing repo',state:{scope:'repository'},pinned:false,createdAt:1,updatedAt:1}]);
    expect(view.unavailableReason).toContain('repository is unavailable');expect(view.state.selectedRepository).toBeUndefined();
  });
});
