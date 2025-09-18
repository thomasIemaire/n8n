import type { GFlowNode, JsonValue } from '../../core/gflow.types';

export interface AgentVersion {
  version: string;
  map: JsonValue;
}

export interface AgentDefinition {
  name: string;
  versions: AgentVersion[];
}

export interface AgentConfig {
  agentName: string;
  version: string;
}

export const AGENT_CATALOG: AgentDefinition[] = [
  {
    name: 'adrs',
    versions: [
      {
        version: '1.0',
        map: {
          address: {
            city: 'ADDRESS_ADDRESS_CITY',
            country: 'ADDRESS_ADDRESS_COUNTRY',
            name: 'ADDRESS_ADDRESS_NAME',
            street: 'ADDRESS_ADDRESS_STREET',
            'zip-code': 'ADDRESS_ADDRESS_ZIP-CODE',
          },
        },
      },
    ],
  },
  {
    name: 'gpt-3.5-turbo',
    versions: [
      { version: '1.0', map: { input: 'GPT_3_5_TURBO_INPUT' } },
      { version: '1.1', map: { input: 'GPT_3_5_TURBO_INPUT_1.1' } },
    ],
  },
  {
    name: 'gpt-4',
    versions: [
      { version: '1.0', map: { input: 'GPT_4_INPUT' } },
      { version: '1.1', map: { input: 'GPT_4_INPUT_1.1' } },
    ],
  },
];

const cloneJson = <T extends JsonValue>(value: T): T => JSON.parse(JSON.stringify(value));

export const createAgentConfig = (catalog: AgentDefinition[] = AGENT_CATALOG): AgentConfig => ({
  agentName: catalog[0]?.name ?? '',
  version: catalog[0]?.versions[0]?.version ?? '',
});

export const ensureAgentConfig = (
  node: GFlowNode,
  catalog: AgentDefinition[] = AGENT_CATALOG,
): AgentConfig => {
  const defaults = createAgentConfig(catalog);
  const cfg = (node.config as AgentConfig | undefined) ?? defaults;
  const normalized: AgentConfig = {
    agentName: cfg.agentName || defaults.agentName,
    version: cfg.version || defaults.version,
  };

  node.config = normalized;
  return normalized;
};

export const versionsForAgent = (
  catalog: AgentDefinition[],
  agentName: string,
): AgentVersion[] => catalog.find((agent) => agent.name === agentName)?.versions ?? [];

export const resolveAgentVersionMap = (
  catalog: AgentDefinition[] = AGENT_CATALOG,
  agentName: string,
  version: string,
): JsonValue => {
  const agent = catalog.find((item) => item.name === agentName);
  const map = agent?.versions.find((entry) => entry.version === version)?.map ?? {};
  return cloneJson(map);
};
