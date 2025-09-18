import { Type } from '@angular/core';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface GFlowPort {
  name?: string;
  map?: JsonValue;
}

export type GFlowConfig = unknown;

export type NodeType =
  | 'start'
  | 'end-success'
  | 'end-error'
  | 'if'
  | 'merge'
  | 'edit'
  | 'sardine'
  | 'agent'
  | 'agent-group';

export interface GFlowNode {
  id: string;
  name: string;
  type: NodeType;
  x: number;
  y: number;
  inputs: GFlowPort[];
  outputs: GFlowPort[];
  entries?: GFlowPort[];
  exits?: GFlowPort[];
  configured?: boolean;
  focused?: boolean;
  config?: GFlowConfig;
  configComponent?: Type<unknown> | null;
}

export class GFlowNodeModel implements GFlowNode {
  id = '';
  name = '';
  type: NodeType = 'start';
  x = 0;
  y = 0;
  inputs: GFlowPort[] = [];
  outputs: GFlowPort[] = [];
  entries: GFlowPort[] = [];
  exits: GFlowPort[] = [];
  configured?: boolean;
  focused?: boolean;
  config?: GFlowConfig;
  configComponent?: Type<unknown> | null;

  constructor(init?: Partial<GFlowNode>) {
    if (!init) {
      return;
    }

    this.id = init.id || Date.now().toString();
    this.name = init.name ?? '';
    this.type = init.type ?? this.type;
    this.x = init.x ?? 0;
    this.y = init.y ?? 0;
    this.inputs = init.inputs ? [...init.inputs] : [];
    this.outputs = init.outputs ? [...init.outputs] : [];
    this.entries = init.entries ? [...init.entries] : [];
    this.exits = init.exits ? [...init.exits] : [];
    this.configured = init.configured;
    this.focused = init.focused ?? false;
    this.config = init.config;
    this.configComponent = init.configComponent ?? null;
  }
}

export type PortKind = 'in' | 'out' | 'entry' | 'exit';

export interface PortRef {
  nodeId: string;
  portIndex: number;
  kind: PortKind;
}

export interface GFlowLink {
  id: string;
  src: PortRef;
  dst: PortRef;
  relation: 'io' | 'entry-exit';
  d?: string;
  mid?: { x: number; y: number };
  map?: JsonValue;
}
