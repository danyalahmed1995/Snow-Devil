import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationRuntime, notificationSimulatorEnabled, shouldHandleNotificationShortcut } from './NotificationRuntime';
import { DEFAULT_NOTIFICATION_PREFERENCES, useNotificationStore } from '../../stores/notification-store';
import { useAuthStore } from '../../stores/auth-store';
import { useModeStore } from '../../stores/mode-store';

beforeEach(() => {
  useAuthStore.setState({ session: { status: 'disconnected' }, isAuthenticated: false });
  useModeStore.setState({ mode: 'live' });
  useNotificationStore.setState({ records: [], settings: { ...DEFAULT_NOTIFICATION_PREFERENCES, sounds: false }, syncByAccount: {}, arrivalCount: 0, arrivalActive: false, newlyArrivedIds: [], pollingStatus: 'paused' });
});

describe('development notification shortcut', () => {
  it('is compile-time guarded and ignores controls, repeat, and editors', () => {
    expect(notificationSimulatorEnabled(false)).toBe(false);
    expect(notificationSimulatorEnabled(true)).toBe(true);
    const input = document.createElement('input');
    const button = document.createElement('button');
    expect(shouldHandleNotificationShortcut({ key: ' ', code: 'Space', repeat: false, shiftKey: false, target: document.body })).toBe(true);
    expect(shouldHandleNotificationShortcut({ key: ' ', code: 'Space', repeat: true, shiftKey: false, target: document.body })).toBe(false);
    expect(shouldHandleNotificationShortcut({ key: ' ', code: 'Space', repeat: false, shiftKey: false, target: input })).toBe(false);
    expect(shouldHandleNotificationShortcut({ key: ' ', code: 'Space', repeat: false, shiftKey: false, target: button })).toBe(false);
    document.body.append(input);
    input.focus();
    expect(shouldHandleNotificationShortcut({ key: ' ', code: 'Space', repeat: false, shiftKey: false, target: document.body })).toBe(false);
    input.remove();
  });

  it('injects one record, clears only tests with Shift+Space, and removes its listener', () => {
    useNotificationStore.setState({ records: [{ id: 'real', unread: true, reason: 'mention', updatedAt: '2026-01-01T00:00:00Z', subject: { title: 'Real', type: 'Issue' }, repository: { fullName: 'octo/app' } }] });
    const view = render(<NotificationRuntime />);
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(useNotificationStore.getState().records.filter(record => record.isTestNotification)).toHaveLength(1);
    fireEvent.keyDown(window, { key: ' ', code: 'Space', shiftKey: true });
    expect(useNotificationStore.getState().records.map(record => record.id)).toEqual(['real']);
    view.unmount();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(useNotificationStore.getState().records.map(record => record.id)).toEqual(['real']);
  });
});
