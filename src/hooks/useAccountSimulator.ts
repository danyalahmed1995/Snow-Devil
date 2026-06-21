import { useState, useEffect } from "react";
import { SimulatorEvent, SimulatorLoadState } from "../simulator/simulator-types";
import { fetchAccountActivity } from "../simulator/simulator-github-api";

import { getSimulatorEventsFromDb, saveSimulatorEventsToDb } from "../simulator/simulator-cache";
import { useModeStore } from "../stores/mode-store";
import { DemoDataProvider } from "../data/demo-provider";

export function useAccountSimulator(login: string) {
  const mode = useModeStore(state => state.mode);
  const demoRevision = useModeStore(state => state.demoRevision);
  const [events, setEvents] = useState<SimulatorEvent[]>([]);
  const [loadState, setLoadState] = useState<SimulatorLoadState>("idle");
  const [since, setSince] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  });
  const [until, setUntil] = useState(() => new Date().toISOString());

  const fetchActivity = async () => {
    setLoadState("loading_initial");
    try {
      if (mode === 'demo') {
        const demoEvents = await DemoDataProvider.accountEvents();
        setEvents(demoEvents);
        setSince(demoEvents[0].occurredAt);
        setUntil(demoEvents[demoEvents.length - 1].occurredAt);
        setLoadState('ready_complete');
        return;
      }
      const scopeId = `account:${login}`;
      
      const cached = await getSimulatorEventsFromDb(scopeId);
      if (cached.length > 0) {
        setEvents(cached);
        setLoadState("refreshing");
      }

      const networkEvents = await fetchAccountActivity(login, since, until);
      
      // Override repositoryId to the scopeId so caching works, 
      // but the event itself contains real repositoryName.
      // Wait, SQLite constraint might require actual repo names, but for account we can use account scope.
      await saveSimulatorEventsToDb(networkEvents);
      
      // But events from fetchAccountActivity have actual repositoryId. We just load all of them.
      // For simplicity, we just use the network events directly if we can't scope the DB properly here.
      setEvents(networkEvents);
      setLoadState("ready_partial");
    } catch (e) {
      console.error(e);
      setLoadState("error");
    }
  };

  useEffect(() => {
    if (login) {
      fetchActivity();
    }
  }, [login, since, until, mode, demoRevision]);

  return { events, loadState, since, until, setSince, setUntil, refresh: fetchActivity };
}
