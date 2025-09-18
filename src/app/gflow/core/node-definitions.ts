import { ConfigAgentGroup } from '../configs/config-agent-group/config-agent-group';
import { ConfigAgent } from '../configs/config-agent/config-agent';
import { ConfigIf } from '../configs/config-if/config-if';
import {
  createAgentConfig,
} from '../configs/config-agent/agent-config';
import { createAgentGroupConfig } from '../configs/config-agent-group/agent-group-config';
import { createCondition } from '../configs/config-if/if-config';
import { GFlowPort, JsonValue, NodeType } from './gflow.types';

const cloneJson = <T extends JsonValue>(value: T): T =>
  JSON.parse(JSON.stringify(value));

const clonePorts = (ports?: GFlowPort[]): GFlowPort[] =>
  (ports ?? []).map((port) => ({
    ...port,
    map: port.map === undefined ? undefined : cloneJson(port.map),
  }));

export type NodeCategory = 'Flux' | 'Logique' | 'Agents';

interface NodeBlueprint {
  name: string;
  inputs?: GFlowPort[];
  outputs?: GFlowPort[];
  entries?: GFlowPort[];
  exits?: GFlowPort[];
  configured?: boolean;
  config?: unknown;
  configComponent?: any;
}

export interface NodeTypeDefinition {
  type: NodeType;
  label: string;
  icon: string;
  category: NodeCategory;
  create: () => NodeBlueprint;
}

export interface PaletteItem {
  type: NodeType;
  label: string;
  icon: string;
}

export interface PaletteGroup {
  name: string;
  items: PaletteItem[];
}

const definitions: NodeTypeDefinition[] = [
  {
    type: 'start',
    label: 'Start',
    icon: 'pi pi-play',
    category: 'Flux',
    create: () => ({
      name: 'Start',
      inputs: [],
      outputs: clonePorts([{}]),
    }),
  },
  {
    type: 'end-success',
    label: 'Fin – Réussite',
    icon: 'pi pi-check-circle',
    category: 'Flux',
    create: () => ({
      name: 'Fin (Réussite)',
      inputs: clonePorts([{}]),
      outputs: [],
    }),
  },
  {
    type: 'end-error',
    label: 'Fin – Erreur',
    icon: 'pi pi-times-circle',
    category: 'Flux',
    create: () => ({
      name: 'Fin (Erreur)',
      inputs: clonePorts([{}]),
      outputs: [],
      config: { message: "Le traitement n'a pas abouti" },
    }),
  },
  {
    type: 'if',
    label: 'If',
    icon: 'pi pi-arrow-right-arrow-left',
    category: 'Logique',
    create: () => ({
      name: 'If',
      inputs: clonePorts([{}]),
      outputs: clonePorts([{ name: 'true' }, { name: 'false' }]),
      configured: false,
      config: { conditions: [createCondition()] },
      configComponent: ConfigIf,
    }),
  },
  {
    type: 'merge',
    label: 'Merge',
    icon: 'pi pi-sitemap',
    category: 'Logique',
    create: () => ({
      name: 'Merge',
      inputs: clonePorts([{}]),
      outputs: clonePorts([{}]),
      configured: false,
    }),
  },
  {
    type: 'edit',
    label: 'Edit',
    icon: 'pi pi-pencil',
    category: 'Logique',
    create: () => ({
      name: 'Edit',
      inputs: clonePorts([{}]),
      outputs: clonePorts([{}]),
      configured: false,
      config: [{ field: '', value: '' }],
    }),
  },
  {
    type: 'sardine',
    label: 'Sardine',
    icon: 'pi pi-send',
    category: 'Agents',
    create: () => ({
      name: 'Sardine',
      inputs: clonePorts([{}]),
      outputs: clonePorts([
        { name: 'valide', map: { sardine: { status: 'success', type: 'SARDINE_FILE_TYPE' } } },
        { name: 'invalide', map: { sardine: { status: 'error', type: 'SARDINE_FILE_TYPE' } } },
      ]),
      configured: false,
      config: [],
    }),
  },
  {
    type: 'agent',
    label: 'Agent',
    icon: 'pi pi-microchip-ai',
    category: 'Agents',
    create: () => ({
      name: 'Agent',
      inputs: clonePorts([{}]),
      outputs: clonePorts([{}]),
      exits: clonePorts([{}]),
      configured: false,
      config: createAgentConfig(),
      configComponent: ConfigAgent,
    }),
  },
  {
    type: 'agent-group',
    label: 'Agent groupé',
    icon: 'pi pi-users',
    category: 'Agents',
    create: () => ({
      name: 'Agent groupé',
      inputs: clonePorts([{}]),
      outputs: clonePorts([{}]),
      entries: clonePorts([{}, {}]),
      configured: false,
      config: createAgentGroupConfig(),
      configComponent: ConfigAgentGroup,
    }),
  },
];

export const NODE_DEFINITIONS = definitions;

export const NODE_DEFINITION_MAP: Record<NodeType, NodeTypeDefinition> = definitions
  .reduce((acc, definition) => {
    acc[definition.type] = definition;
    return acc;
  }, {} as Record<NodeType, NodeTypeDefinition>);

export const PALETTE_GROUPS: PaletteGroup[] = (() => {
  const groups = new Map<NodeCategory, PaletteGroup>();

  definitions.forEach((definition) => {
    const existing = groups.get(definition.category);
    const item: PaletteItem = {
      type: definition.type,
      label: definition.label,
      icon: definition.icon,
    };

    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(definition.category, {
        name: definition.category,
        items: [item],
      });
    }
  });

  return Array.from(groups.values()).map((group) => ({
    name: group.name,
    items: [...group.items],
  }));
})();

