import { GFlowNode, NodeType } from '../core/gflow.types';
import { ensureAgentConfig } from './config-agent/config-agent';
import { ensureAgentGroupConfig } from './config-agent-group/config-agent-group';
import { ensureIfConfig } from './config-if/config-if';

type ConfigInitializer = (node: GFlowNode) => void;

const INITIALIZERS: Partial<Record<NodeType, ConfigInitializer>> = {
  agent: ensureAgentConfig,
  'agent-group': ensureAgentGroupConfig,
  if: ensureIfConfig,
};

export const initializeNodeConfig = (node: GFlowNode): void => {
  INITIALIZERS[node.type]?.(node);
};
