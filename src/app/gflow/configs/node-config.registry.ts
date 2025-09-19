import { GFlowNode, NodeType } from '../core/gflow.types';
import { ensureAgentConfig } from './config-agent/config-agent';
import { ensureAgentGroupConfig } from './config-agent-group/config-agent-group';
import { ensureIfConfig } from './config-if/config-if';
import { ensureSwitchConfig } from './config-switch/config-switch.component';

type ConfigInitializer = (node: GFlowNode) => void;

const INITIALIZERS: Partial<Record<NodeType, ConfigInitializer>> = {
  agent: ensureAgentConfig,
  'agent-group': ensureAgentGroupConfig,
  if: ensureIfConfig,
  switch: ensureSwitchConfig,
};

export const initializeNodeConfig = (node: GFlowNode): void => {
  INITIALIZERS[node.type]?.(node);
};
