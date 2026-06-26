import { useEffect, useMemo, useState } from "react";
import { SimulatorEvent, SimulatorEntityState } from "../simulator/simulator-types";
import { reconstructState } from "../simulator/simulator-reducer";

export function useSimulatorPlayback(events: SimulatorEvent[], loadedSince: string, loadedUntil: string) {
  const [cursor, setCursor] = useState<string>(loadedSince);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const currentState = useMemo<Map<string, SimulatorEntityState>>(
    () => reconstructState(events, cursor),
    [events, cursor],
  );

  const meaningfulTimestamps = useMemo(() => [...new Set(events.map(event => event.occurredAt))].sort(), [events]);

  useEffect(() => {
    setIsPlaying(false);
    setCursor(loadedUntil);
  }, [loadedSince, loadedUntil]);

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

  const togglePlay = () => setIsPlaying(p => !p);
  const pause = () => setIsPlaying(false);
  const play = () => setIsPlaying(true);
  
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
    setCursor(val);
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
