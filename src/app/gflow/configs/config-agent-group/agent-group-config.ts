import type { GFlowNode } from '../../core/gflow.types';

export interface AgentGroupConfig {
  map: Record<string, unknown>;
  ids: string[];
}

export const createAgentGroupConfig = (): AgentGroupConfig => ({
  map: {},
  ids: [],
});

const isAgentGroupConfig = (value: unknown): value is AgentGroupConfig =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const ensureAgentGroupConfig = (node: GFlowNode): AgentGroupConfig => {
  const cfg = (node.config as AgentGroupConfig | undefined);
  if (!isAgentGroupConfig(cfg)) {
    node.config = createAgentGroupConfig();
  }

  const normalized = node.config as AgentGroupConfig;
  normalized.map ??= {};
  normalized.ids ??= [];
  return normalized;
};
