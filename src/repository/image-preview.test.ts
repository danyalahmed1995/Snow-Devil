import { describe,expect,it } from 'vitest';
import { sanitizeSvg } from './image-preview';
describe('safe SVG preview',()=>{
  it('removes scripts, handlers, and external resources',()=>{const value=sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://bad.test/x"/><rect onload="x()"/><use href="#safe"/></svg>');expect(value).not.toContain('script');expect(value).not.toContain('onload');expect(value).not.toContain('https://');expect(value).toContain('#safe');});
  it('rejects malformed non-SVG documents',()=>expect(()=>sanitizeSvg('<html/>')).toThrow('Invalid SVG'));
});
