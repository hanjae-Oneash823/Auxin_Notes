import type { EntityStatus } from '../db/queries/planner/types';
import { PlannerSelect } from './PlannerSelect';

const STATUS_GROUPS = [{ options: (['active', 'done', 'archived'] as const).map((status) => ({ value: status, label: status })) }];

export function StatusSelect({ status, onChange, className = 'w-28', isCompact = false }: { status: EntityStatus; onChange: (status: EntityStatus) => void; className?: string; isCompact?: boolean }) {
  return <PlannerSelect value={status} onChange={(value) => onChange(value as EntityStatus)} groups={STATUS_GROUPS} ariaLabel="Status" className={className} isCompact={isCompact} />;
}
