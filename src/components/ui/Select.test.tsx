import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

describe('shared themed Select', () => {
  it('supports arrows, Enter, Escape, Home, End, and selected checkmarks', () => {
    const onChange = vi.fn();
    render(<Select ariaLabel="Speed" value="1" onChange={onChange} options={[{ value: '0.5', label: '0.5×' }, { value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }]} />);
    const trigger = screen.getByRole('combobox', { name: 'Speed' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox', { name: 'Speed' })).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'End' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('4');
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Speed' })).not.toBeInTheDocument();
  });

  it('supports searchable repository options and disabled reasons', () => {
    render(<Select ariaLabel="Repository" searchable value="a" onChange={() => {}} options={[{ value: 'a', label: 'octo/app' }, { value: 'b', label: 'octo/private', disabled: true, disabledReason: 'Sync failed' }]} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Repository' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Repository' }), { target: { value: 'private' } });
    expect(screen.getByRole('option', { name: /octo\/private/ })).toBeDisabled();
    expect(screen.getByText('Sync failed')).toBeInTheDocument();
  });
});
