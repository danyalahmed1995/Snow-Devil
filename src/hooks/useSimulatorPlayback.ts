import { useEffect, useMemo, useRef, useState } from "react";
import { SimulatorEvent, SimulatorEntityState } from "../simulator/simulator-types";
import { reconstructState } from "../simulator/simulator-reducer";
import { historyCalendarCutoffs, normalizeHistoryCutoff } from '../lib/history-date';

export function useSimulatorPlayback(events: SimulatorEvent[], loadedSince: string, loadedUntil: string, options: { timeZone?: string; reducedMotion?: boolean; initialCursor?: string; onCursorChange?: (cursor: string) => void } = {}) {
  const [cursor, setCursor] = useState<string>(() => options.initialCursor ? normalizeHistoryCutoff(options.initialCursor, loadedUntil, options.timeZone) : loadedUntil);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const previousUntilRef = useRef(loadedUntil);
  const currentState = useMemo<Map<string, SimulatorEntityState>>(
    () => reconstructState(events, cursor),
    [events, cursor],
  );

  const meaningfulTimestamps = useMemo(() => options.timeZone
    ? historyCalendarCutoffs(events.map(event => event.occurredAt), loadedUntil, options.timeZone)
    : [...new Set(events.map(event => event.occurredAt))].sort(), [events, loadedUntil, options.timeZone]);

  useEffect(() => {
    setIsPlaying(false);
    const prevUntil = previousUntilRef.current;
    setCursor(current => current >= prevUntil ? loadedUntil : current < loadedSince ? (options.timeZone ? normalizeHistoryCutoff(loadedSince, loadedUntil, options.timeZone) : loadedSince) : current > loadedUntil ? loadedUntil : current);
    previousUntilRef.current = loadedUntil;
  }, [loadedSince, loadedUntil, options.timeZone]);

  useEffect(() => { options.onCursorChange?.(cursor); }, [cursor, options.onCursorChange]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setCursor(current => {
        const next = meaningfulTimestamps.find(timestamp => timestamp > current);
        if (!next) {
          setIsPlaying(false);
          return loadedUntil;
        }
        return next;
      });
    }, Math.max(120, 800 / speedMultiplier));
    return () => window.clearInterval(timer);
  }, [isPlaying, loadedUntil, meaningfulTimestamps, speedMultiplier]);

  const togglePlay = () => options.reducedMotion ? stepForward() : setIsPlaying(p => !p);
  const pause = () => setIsPlaying(false);
  const play = () => options.reducedMotion ? stepForward() : setIsPlaying(true);
  
  const stepForward = () => {
    pause();
    const next = meaningfulTimestamps.find(timestamp => timestamp > cursor);
    if (next) {
      setCursor(next);
    } else {
      setCursor(loadedUntil);
    }
  };

  const stepBackward = () => {
    pause();
    let previous: string | undefined;
    for (let i = meaningfulTimestamps.length - 1; i >= 0; i--) {
      if (meaningfulTimestamps[i] < cursor) {
        previous = meaningfulTimestamps[i];
        break;
      }
    }
    if (previous) {
      setCursor(previous);
    } else {
      setCursor(loadedSince);
    }
  };

  const setCursorManual = (val: string) => {
    pause();
    setCursor(options.timeZone ? normalizeHistoryCutoff(val, loadedUntil, options.timeZone) : val);
  };

  return {
    cursor,
    isPlaying,
    speedMultiplier,
    currentState,
    togglePlay,
    pause,
    play,
    stepForward,
    stepBackward,
    setCursorManual,
    setSpeedMultiplier
  };
}
