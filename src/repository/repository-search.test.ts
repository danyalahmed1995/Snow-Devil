import { describe,expect,it } from 'vitest';
import { classifyRepositorySearchError,matchesRepositorySearch,parseRepositorySearch,toGitHubCodeQuery } from './repository-search';
describe('full repository search syntax',()=>{
  it('keeps remote qualifiers distinct from free text',()=>{expect(parseRepositorySearch('path:src filename:parser.ts ext:ts "exact phrase"')).toEqual({text:'',path:'src',filename:'parser.ts',extension:'ts',exactPhrase:'exact phrase'});expect(toGitHubCodeQuery('folder:docs ext:md snow','owner/repo')).toContain('repo:owner/repo')});
  it('filters deterministic demo paths with the same modest syntax',()=>{expect(matchesRepositorySearch('docs/large file.md','folder:docs ext:md large')).toBe(true);expect(matchesRepositorySearch('src/main.ts','folder:docs')).toBe(false)});
  it('preserves Unicode and URL-sensitive paths',()=>{expect(matchesRepositorySearch('docs/日本語/a+b guide.md','folder:"docs/日本語" ext:md a+b')).toBe(true);expect(toGitHubCodeQuery('path:"src/a b"','owner/repo')).toContain('path:src/a b')});
  it('classifies safe adapter errors for in-panel recovery',()=>{expect(classifyRepositorySearchError('status 403 secondary rate limit')).toBe('rate-limit');expect(classifyRepositorySearchError('401 token expired')).toBe('authentication');expect(classifyRepositorySearchError('404 not found')).toBe('not-found');expect(classifyRepositorySearchError('network offline')).toBe('network')});
});
