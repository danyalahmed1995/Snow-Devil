import { useEffect, useMemo, useRef, useState } from "react";
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

  const lastUpdateRef = useRef<number>(0);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setIsPlaying(false);
    setCursor(loadedUntil);
  }, [loadedSince, loadedUntil]);

  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    lastUpdateRef.current = Date.now();

    const animate = () => {
      const now = Date.now();
      const deltaMs = now - lastUpdateRef.current;
      lastUpdateRef.current = now;

      setCursor(prevCursor => {
        const prevTime = new Date(prevCursor).getTime();
        // 1 day per second at 1x speed => 86400000 ms simulated per 1000ms real
        // Let's do 1 hour per real second at 1x = 3600000ms
        const simulatedMsPerRealMs = 3600 * speedMultiplier;
        const newTime = prevTime + deltaMs * simulatedMsPerRealMs;
        
        const untilTime = new Date(loadedUntil).getTime();
        if (newTime >= untilTime) {
          setIsPlaying(false);
          return loadedUntil;
        }
        
        return new Date(newTime).toISOString();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, speedMultiplier, loadedUntil]);

  const togglePlay = () => setIsPlaying(p => !p);
  const pause = () => setIsPlaying(false);
  const play = () => setIsPlaying(true);
  
  const stepForward = () => {
    pause();
    const currentEventIndex = events.findIndex(e => e.occurredAt > cursor);
    if (currentEventIndex !== -1) {
      setCursor(events[currentEventIndex].occurredAt);
    } else {
      setCursor(loadedUntil);
    }
  };

  const stepBackward = () => {
    pause();
    let currentEventIndex = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].occurredAt < cursor) {
        currentEventIndex = i;
        break;
      }
    }
    if (currentEventIndex !== -1) {
      setCursor(events[currentEventIndex].occurredAt);
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
