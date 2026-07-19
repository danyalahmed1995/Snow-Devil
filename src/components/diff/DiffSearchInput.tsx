import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

const SEARCH_DELAY_MS = 250;

export function DiffSearchInput({ initialValue = '', onQueryChange }: { initialValue?: string; onQueryChange: (query: string) => void }) {
  const [value, setValue] = useState(initialValue);
  const onQueryChangeRef = useRef(onQueryChange);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  }, [onQueryChange]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => onQueryChangeRef.current(value), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  const applyImmediately = (nextValue: string) => {
    setValue(nextValue);
    onQueryChangeRef.current(nextValue);
  };

  return (
    <label className="diff-search">
      <Search size={13} />
      <input
        aria-label="Search changed files"
        value={value}
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') onQueryChangeRef.current(value);
          if (event.key === 'Escape') applyImmediately('');
        }}
        placeholder="Search changes"
      />
    </label>
  );
}
