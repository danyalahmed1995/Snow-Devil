let context: AudioContext | undefined;
let lastPlayedAt = 0;

export function playNotificationSound(now = Date.now()): boolean {
  if (now - lastPlayedAt < 900) return false;
  lastPlayedAt = now;
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return false;
    context ??= new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(740, start);
    oscillator.frequency.exponentialRampToValueAtTime(920, start + 0.08);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    void context.resume().catch(() => undefined);
    oscillator.start(start);
    oscillator.stop(start + 0.13);
    return true;
  } catch {
    return false;
  }
}

export async function releaseNotificationSound(): Promise<void> {
  const current = context;
  context = undefined;
  if (current && current.state !== 'closed') await current.close().catch(() => undefined);
}

