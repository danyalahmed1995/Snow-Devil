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
  const visibleEntities = expanded ? entities : entities.slice(0, SIMULATOR_STAGE_PREVIEW_LIMIT);
  const hiddenCount = entities.length - visibleEntities.length;
  return <section className={`simulator-stage simulator-stage--${stage}`}>
    <h3 className="simulator-stage__header">{humanizeSimulatorValue(stage)}<span>{entities.length}</span></h3>
    <div className={`simulator-stage__cards${expanded ? ' is-expanded' : ''}`}>
      {visibleEntities.map(entity => <SimulatorCard key={entity.id} entity={entity} isSelected={selectedEntityId === entity.id} onClick={() => onSelect(entity)} />)}
      {hiddenCount > 0 && <button type="button" className="simulator-stage__more" aria-label={`Show ${hiddenCount} more ${humanizeSimulatorValue(stage)}`} onClick={onExpand}>+{hiddenCount} more</button>}
    </div>
  </section>;
}
