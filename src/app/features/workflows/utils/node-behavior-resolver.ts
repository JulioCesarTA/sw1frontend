export type WorkflowNodeType = 'inicio' | 'proceso' | 'decision' | 'bifurcasion' | 'union' | 'fin' | 'iteracion';

export interface WorkflowNodeLike {
  nodeType?: string | null;
}

export interface NodeBehavior {
  readonly type: WorkflowNodeType;
  readonly isHuman: boolean;
  readonly isLogical: boolean;
  readonly width: number;
  readonly height: number;
  resolveCenter(posX: number, posY: number): { x: number; y: number };
  defaultTransitionName(outgoingCount: number): string;
}

const DEFAULT_NODE_TYPE: WorkflowNodeType = 'proceso';

abstract class BaseNodeBehavior implements NodeBehavior {
  abstract readonly type: WorkflowNodeType;
  abstract readonly isHuman: boolean;
  abstract readonly isLogical: boolean;
  abstract readonly width: number;
  abstract readonly height: number;

  resolveCenter(posX: number, posY: number) {
    return { x: posX + this.width / 2, y: posY + this.height / 2 };
  }

  defaultTransitionName(_outgoingCount: number) {
    return '';
  }
}

class InicioBehavior extends BaseNodeBehavior {
  readonly type = 'inicio' as const;
  readonly isHuman = false;
  readonly isLogical = false;
  readonly width = 82;
  readonly height = 82;
}

class ProcesoBehavior extends BaseNodeBehavior {
  readonly type = 'proceso' as const;
  readonly isHuman = true;
  readonly isLogical = false;
  readonly width = 210;
  readonly height = 140;
}

class DecisionBehavior extends BaseNodeBehavior {
  readonly type = 'decision' as const;
  readonly isHuman = false;
  readonly isLogical = true;
  readonly width = 104;
  readonly height = 104;

  override defaultTransitionName(outgoingCount: number) {
    return outgoingCount === 0 ? 'Aceptar' : 'Rechazar';
  }
}

class BifurcasionBehavior extends BaseNodeBehavior {
  readonly type = 'bifurcasion' as const;
  readonly isHuman = false;
  readonly isLogical = true;
  readonly width = 150;
  readonly height = 44;

  override resolveCenter(posX: number, posY: number) {
    return { x: posX + 75, y: posY + 8 };
  }
}

class UnionBehavior extends BaseNodeBehavior {
  readonly type = 'union' as const;
  readonly isHuman = false;
  readonly isLogical = true;
  readonly width = 150;
  readonly height = 44;

  override resolveCenter(posX: number, posY: number) {
    return { x: posX + 75, y: posY + 8 };
  }
}

class FinBehavior extends BaseNodeBehavior {
  readonly type = 'fin' as const;
  readonly isHuman = false;
  readonly isLogical = false;
  readonly width = 82;
  readonly height = 82;
}

class IteracionBehavior extends BaseNodeBehavior {
  readonly type = 'iteracion' as const;
  readonly isHuman = false;
  readonly isLogical = true;
  readonly width = 104;
  readonly height = 104;

  override defaultTransitionName(outgoingCount: number) {
    return outgoingCount === 0 ? 'Aceptar' : 'Repetir';
  }
}

export class NodeBehaviorResolver {
  private readonly behaviors = new Map<WorkflowNodeType, NodeBehavior>([
    ['inicio', new InicioBehavior()],
    ['proceso', new ProcesoBehavior()],
    ['decision', new DecisionBehavior()],
    ['bifurcasion', new BifurcasionBehavior()],
    ['union', new UnionBehavior()],
    ['fin', new FinBehavior()],
    ['iteracion', new IteracionBehavior()]
  ]);

  resolve(nodeOrType?: WorkflowNodeLike | string | null): NodeBehavior {
    const type = this.resolveType(nodeOrType);
    return this.behaviors.get(type) ?? this.behaviors.get(DEFAULT_NODE_TYPE)!;
  }

  resolveType(nodeOrType?: WorkflowNodeLike | string | null): WorkflowNodeType {
    const raw = typeof nodeOrType === 'string' ? nodeOrType : nodeOrType?.nodeType;
    const normalized = String(raw || DEFAULT_NODE_TYPE).toLowerCase() as WorkflowNodeType;
    return this.behaviors.has(normalized) ? normalized : DEFAULT_NODE_TYPE;
  }
}
