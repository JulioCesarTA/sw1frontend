import { NodeBehaviorResolver } from './node-behavior-resolver';

interface WorkflowDepartmentLike {
  id: string;
}

interface WorkflowNodoLike {
  id: string;
  order: number;
  nodeType?: string | null;
  responsibleDepartmentId?: string | null;
  posX?: number;
  posY?: number;
}

interface WorkflowTransitionLike {
  fromNodoId: string;
  toNodoId: string;
}

interface WorkflowLike<TNodo extends WorkflowNodoLike, TTransition extends WorkflowTransitionLike> {
  nodo: TNodo[];
  transitions: TTransition[];
}

export function autoLayoutWorkflowNodos<
  TNodo extends WorkflowNodoLike,
  TTransition extends WorkflowTransitionLike,
  TDepartment extends WorkflowDepartmentLike
>(
  workflow: WorkflowLike<TNodo, TTransition>,
  departments: TDepartment[],
  nodeBehaviorResolver: NodeBehaviorResolver
): TNodo[] {
  if (!workflow.nodo.length) return workflow.nodo;

  const laneWidth = 300;
  const topPadding = 48;
  const rowGap = 220;
  const rowOverlapOffset = 28;

  const usedDepartmentIds = [...new Set(
    workflow.nodo
      .map(nodo => nodo.responsibleDepartmentId)
      .filter((departmentId): departmentId is string => !!departmentId)
  )];
  const orderedDepartmentIds = departments
    .map(department => department.id)
    .filter(departmentId => usedDepartmentIds.includes(departmentId));
  const laneIds = (orderedDepartmentIds.length ? orderedDepartmentIds : departments.map(department => department.id)).concat(
    usedDepartmentIds.filter(departmentId => !orderedDepartmentIds.includes(departmentId))
  );
  const laneIndexByDepartmentId = new Map(laneIds.map((departmentId, index) => [departmentId, index]));
  const laneCount = Math.max(laneIds.length, 1);
  const laneCenterX = (laneIndex: number) => laneIndex * laneWidth + laneWidth / 2;
  const canvasWidth = laneCount * laneWidth;

  const incomingByNodoId = new Map<string, string[]>();
  const outgoingByNodoId = new Map<string, string[]>();
  for (const nodo of workflow.nodo) {
    incomingByNodoId.set(nodo.id, []);
    outgoingByNodoId.set(nodo.id, []);
  }
  for (const transition of workflow.transitions) {
    incomingByNodoId.get(transition.toNodoId)?.push(transition.fromNodoId);
    outgoingByNodoId.get(transition.fromNodoId)?.push(transition.toNodoId);
  }

  const sortedNodos = [...workflow.nodo].sort((a, b) => (a.order || 0) - (b.order || 0));
  const rootIds = sortedNodos
    .filter(nodo => (incomingByNodoId.get(nodo.id)?.length ?? 0) === 0)
    .map(nodo => nodo.id);
  const startIds = sortedNodos
    .filter(nodo => nodeBehaviorResolver.resolveType(nodo) === 'inicio')
    .map(nodo => nodo.id);
  const queue = (startIds.length ? startIds : rootIds.length ? rootIds : sortedNodos.map(nodo => nodo.id)).slice();
  const levelByNodoId = new Map<string, number>();
  const queued = new Set(queue);

  for (const nodoId of queue) {
    levelByNodoId.set(nodoId, 0);
  }

  while (queue.length) {
    const currentId = queue.shift()!;
    const currentLevel = levelByNodoId.get(currentId) ?? 0;
    for (const nextId of outgoingByNodoId.get(currentId) ?? []) {
      const nextLevel = currentLevel + 1;
      if ((levelByNodoId.get(nextId) ?? -1) < nextLevel) {
        levelByNodoId.set(nextId, nextLevel);
      }
      if (!queued.has(nextId)) {
        queue.push(nextId);
        queued.add(nextId);
      }
    }
  }

  for (const nodo of sortedNodos) {
    if (!levelByNodoId.has(nodo.id)) {
      const incomingLevels = (incomingByNodoId.get(nodo.id) ?? [])
        .map(incomingId => levelByNodoId.get(incomingId))
        .filter((level): level is number => typeof level === 'number');
      levelByNodoId.set(nodo.id, incomingLevels.length ? Math.max(...incomingLevels) + 1 : 0);
    }
  }

  const relatedLaneIndexesForNodo = (nodo: TNodo): number[] => [
    ...(incomingByNodoId.get(nodo.id) ?? []).map(id => workflow.nodo.find(item => item.id === id)),
    ...(outgoingByNodoId.get(nodo.id) ?? []).map(id => workflow.nodo.find(item => item.id === id))
  ]
    .filter((related): related is TNodo => !!related)
    .map(related => related.responsibleDepartmentId ? laneIndexByDepartmentId.get(related.responsibleDepartmentId) : undefined)
    .filter((laneIndex): laneIndex is number => typeof laneIndex === 'number');

  const laneForNodo = (nodo: TNodo): number => {
    const directLane = nodo.responsibleDepartmentId ? laneIndexByDepartmentId.get(nodo.responsibleDepartmentId) : undefined;
    if (typeof directLane === 'number') return directLane;

    const relatedLaneIndexes = relatedLaneIndexesForNodo(nodo);
    if (!relatedLaneIndexes.length) return 0;
    const average = relatedLaneIndexes.reduce((sum, laneIndex) => sum + laneIndex, 0) / relatedLaneIndexes.length;
    return Math.max(0, Math.min(laneIds.length - 1, Math.round(average)));
  };

  const overlapCountBySlot = new Map<string, number>();
  return sortedNodos.map(nodo => {
    const behavior = nodeBehaviorResolver.resolve(nodo);
    const laneIndex = laneForNodo(nodo);
    const level = levelByNodoId.get(nodo.id) ?? 0;
    const slotKey = `${laneIndex}:${level}`;
    const overlapIndex = overlapCountBySlot.get(slotKey) ?? 0;
    overlapCountBySlot.set(slotKey, overlapIndex + 1);
    const relatedLaneIndexes = relatedLaneIndexesForNodo(nodo);
    const relatedCenters = relatedLaneIndexes.map(index => laneCenterX(index));
    const preferredCenterX = behavior.isHuman || !relatedCenters.length
      ? laneCenterX(laneIndex)
      : relatedCenters.reduce((sum, center) => sum + center, 0) / relatedCenters.length;
    const minX = 12;
    const maxX = Math.max(12, canvasWidth - behavior.width - 12);
    const x = Math.max(minX, Math.min(maxX, Math.round(preferredCenterX - behavior.width / 2)));
    const y = Math.max(12, Math.round(topPadding + level * rowGap + overlapIndex * rowOverlapOffset));

    return {
      ...nodo,
      posX: x,
      posY: y
    };
  });
}
