import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiffSearchInput } from './DiffSearchInput';

afterEach(() => {
  vi.useRealTimers();
});

describe('DiffSearchInput', () => {
  it('keeps keystrokes local until the user pauses', () => {
    vi.useFakeTimers();
    const parentRenders: number[] = [];

    function Harness() {
      const [, setQuery] = useState('');
      const renderCount = useRef(0);
      renderCount.current += 1;
      parentRenders.push(renderCount.current);
      return <DiffSearchInput onQueryChange={setQuery} />;
    }

    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Search changed files' });

    fireEvent.change(input, { target: { value: 'memory' } });

    expect(input).toHaveValue('memory');
    expect(parentRenders).toEqual([1]);

    act(() => vi.advanceTimersByTime(249));
    expect(parentRenders).toEqual([1]);

    act(() => vi.advanceTimersByTime(1));
    expect(parentRenders).toEqual([1, 2]);
  });

  it('applies immediately on Enter and clears immediately on Escape', () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();
    render(<DiffSearchInput onQueryChange={onQueryChange} />);
    const input = screen.getByRole('textbox', { name: 'Search changed files' });

    fireEvent.change(input, { target: { value: 'memory' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onQueryChange).toHaveBeenLastCalledWith('memory');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(onQueryChange).toHaveBeenLastCalledWith('');
  });
});
