import { describe,expect,it } from 'vitest';
import { filterTreeEntries,flatEntriesToRows } from './tree-model';
import type { RepositoryEntry } from './repository-types';
const entries:RepositoryEntry[]=[{name:'src',path:'src',type:'tree'},{name:'deep',path:'src/deep',type:'tree'},{name:'App.tsx',path:'src/deep/App.tsx',type:'blob'},{name:'README.md',path:'README.md',type:'blob'}];
describe('repository tree model',()=>{
  it('preserves ancestors for deep search matches',()=>expect([...filterTreeEntries(entries,'app')]).toEqual(['src/deep/App.tsx','src','src/deep']));
  it('constructs nested rows with stable depths',()=>expect(flatEntriesToRows(entries,'').map(row=>[row.path,row.depth])).toEqual([['src',0],['src/deep',1],['src/deep/App.tsx',2],['README.md',0]]));
  it('search keeps hierarchy instead of flattening',()=>expect(flatEntriesToRows(entries,'app').map(row=>row.path)).toEqual(['src','src/deep','src/deep/App.tsx']));
});
