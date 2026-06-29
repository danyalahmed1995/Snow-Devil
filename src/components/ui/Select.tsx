import { Check, ChevronDown, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useOverlayStore } from '../../stores/overlay-store';
import './Select.css';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Select<T extends string>({ value, options, onChange, ariaLabel, searchable = false, searchPlaceholder = 'Search…', disabled = false, className = '' }: SelectProps<T>) {
  const reactId = useId();
  const overlayId = `select:${reactId}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  const activeOverlayId = useOverlayStore(state => state.activeOverlayId);
  const openOverlay = useOverlayStore(state => state.openOverlay);
  const closeOverlay = useOverlayStore(state => state.closeOverlay);
  const selected = options.find(option => option.value === value) ?? options[0];
  const visibleOptions = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search ? options.filter(option => `${option.label} ${option.description ?? ''}`.toLowerCase().includes(search)) : options;
  }, [options, query]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    setQuery('');
    closeOverlay(overlayId);
    if (restoreFocus) requestAnimationFrame(() => buttonRef.current?.focus());
  };
  const show = () => {
    if (disabled) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setBounds(rect);
    setOpen(true);
    setActiveIndex(Math.max(0, options.findIndex(option => option.value === value)));
    openOverlay(overlayId);
  };

  useEffect(() => {
    if (open && activeOverlayId && activeOverlayId !== overlayId) setOpen(false);
  }, [activeOverlayId, open, overlayId]);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setBounds(rect);
    };
    const pointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !(document.getElementById(`${overlayId}:menu`)?.contains(target))) close(false);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('pointerdown', pointer);
    requestAnimationFrame(() => searchable ? searchRef.current?.focus() : document.getElementById(`${overlayId}:option:${activeIndex}`)?.focus());
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('pointerdown', pointer);
    };
  }, [open, searchable, activeIndex, overlayId]);
  useEffect(() => () => closeOverlay(overlayId), [closeOverlay, overlayId]);

  const choose = (option: SelectOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };
  const move = (direction: 1 | -1) => {
    if (!visibleOptions.length) return;
    let next = activeIndex;
    do next = (next + direction + visibleOptions.length) % visibleOptions.length;
    while (visibleOptions[next]?.disabled && next !== activeIndex);
    setActiveIndex(next);
    requestAnimationFrame(() => document.getElementById(`${overlayId}:option:${next}`)?.focus());
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      show();
      return;
    }
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Home') { event.preventDefault(); setActiveIndex(0); }
    else if (event.key === 'End') { event.preventDefault(); setActiveIndex(Math.max(0, visibleOptions.length - 1)); }
    else if (event.key === 'Enter' || event.key === ' ') {
      if (searchable && event.currentTarget === searchRef.current && event.key === ' ') return;
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) choose(option);
    }
  };

  const menu = open && bounds ? createPortal(
    <div
      id={`${overlayId}:menu`}
      className="sd-select__menu glass-panel-strong"
      style={{
        left: Math.min(bounds.left, window.innerWidth - Math.max(bounds.width, 240) - 8),
        top: Math.min(bounds.bottom + 5, window.innerHeight - 340),
        minWidth: Math.max(bounds.width, 180),
        maxWidth: Math.min(460, window.innerWidth - 16),
      }}
      role="listbox"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {searchable && <label className="sd-select__search"><Search size={13} /><input ref={searchRef} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} placeholder={searchPlaceholder} aria-label={`Search ${ariaLabel}`} /></label>}
      <div className="sd-select__options">
        {visibleOptions.map((option, index) => <button
          id={`${overlayId}:option:${index}`}
          type="button"
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled}
          disabled={option.disabled}
          data-tooltip={option.disabledReason}
          className={index === activeIndex ? 'is-active' : ''}
          key={option.value}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(option)}
        >
          <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}{option.disabledReason && <small>{option.disabledReason}</small>}</span>
          {option.value === value && <Check size={14} />}
        </button>)}
        {!visibleOptions.length && <p className="sd-select__empty">No matching options</p>}
      </div>
    </div>,
    document.body,
  ) : null;

  return <div className={`sd-select ${className}`}>
    <button ref={buttonRef} type="button" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-controls={`${overlayId}:menu`} disabled={disabled} className="sd-select__trigger" onClick={() => open ? close(false) : show()} onKeyDown={onKeyDown}>
      <span data-tooltip={selected?.label}>{selected?.label ?? 'Select…'}</span><ChevronDown size={13} />
    </button>
    {menu}
  </div>;
}
