import type { NativeTab } from '../../browser/browser-tabs';

/** Only the lightweight Home singleton is allowed to retain a rendered tree while inactive. */
export function shouldKeepNativeSurfaceMounted(kind: NativeTab['kind']): boolean {
  return kind === 'home';
}
