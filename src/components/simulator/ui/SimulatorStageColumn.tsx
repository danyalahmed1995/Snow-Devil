import { useEffect, useRef } from 'react';
import type { SimulatorEntityState } from '../../../simulator/simulator-types';
import { humanizeSimulatorValue } from '../../../simulator/simulator-presentation';
import { SimulatorCard } from './SimulatorCard';

export const SIMULATOR_STAGE_PREVIEW_LIMIT = 4;

export function SimulatorStageColumn({ stage, entities, expanded, selectedEntityId, onExpand, onSelect }: {
  stage: string;
  entities: SimulatorEntityState[];
  expanded: boolean;
  selectedEntityId?: string;
  onExpand: () => void;
  onSelect: (entity: SimulatorEntityState) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const visibleEntities = expanded ? entities : entities.slice(0, SIMULATOR_STAGE_PREVIEW_LIMIT);
  const hiddenCount = Math.max(0, entities.length - SIMULATOR_STAGE_PREVIEW_LIMIT);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (!expanded) {
      viewport.scrollTop = 0;
      return;
    }
    const selected = selectedEntityId ? [...viewport.querySelectorAll<HTMLElement>('[data-entity-id]')].find(element => element.dataset.entityId === selectedEntityId) : null;
    selected?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded, selectedEntityId]);

  return <section className={`simulator-stage simulator-stage--${stage}`}>
    <h3 className="simulator-stage__header">{humanizeSimulatorValue(stage)}<span>{entities.length}</span></h3>
    <div ref={viewportRef} data-testid={`simulator-stage-viewport-${stage}`} className={`simulator-stage__viewport${expanded ? ' is-expanded' : ''}`} tabIndex={expanded ? 0 : undefined}>
      <div className="simulator-stage__cards">
        {visibleEntities.map(entity => <div key={entity.id} data-entity-id={entity.id}><SimulatorCard entity={entity} isSelected={selectedEntityId === entity.id} onClick={() => onSelect(entity)} /></div>)}
      </div>
    </div>
    {hiddenCount > 0 && <button type="button" className="simulator-stage__more" aria-label={expanded ? `Show fewer ${humanizeSimulatorValue(stage)}` : `Show ${hiddenCount} more ${humanizeSimulatorValue(stage)}`} onClick={onExpand}>{expanded ? 'Show fewer' : `+${hiddenCount} more`}</button>}
  </section>;
}
