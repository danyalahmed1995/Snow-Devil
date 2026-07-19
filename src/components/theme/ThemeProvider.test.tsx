import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider';

describe('ThemeProvider window activity lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.dataset.windowActive;
  });

  it('pauses ambient motion when the app loses focus and resumes on focus', () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const view = render(<ThemeProvider />);
    expect(document.documentElement.dataset.windowActive).toBe('true');

    hasFocus.mockReturnValue(false);
    fireEvent.blur(window);
    expect(document.documentElement.dataset.windowActive).toBe('false');

    hasFocus.mockReturnValue(true);
    fireEvent.focus(window);
    expect(document.documentElement.dataset.windowActive).toBe('true');

    view.unmount();
    expect(document.documentElement.dataset.windowActive).toBeUndefined();
  });
});
