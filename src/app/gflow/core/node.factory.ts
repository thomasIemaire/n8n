import { GFlowNode, GFlowNodeModel, NodeType } from './gflow.types';
import { NODE_DEFINITION_MAP } from './node-definitions';
import { initializeNodeConfig } from '../configs/node-config.registry';

export class NodeFactory {
  public static createNode(type: NodeType, x: number, y: number): GFlowNode {
    const definition = NODE_DEFINITION_MAP[type];
    if (!definition) {
      throw new Error(`Unknown node type: ${type}`);
    }

    const blueprint = definition.create();

    const node = new GFlowNodeModel({
      type,
      name: blueprint.name,
      x,
      y,
      inputs: blueprint.inputs ?? [],
      outputs: blueprint.outputs ?? [],
      entries: blueprint.entries ?? [],
      exits: blueprint.exits ?? [],
      configured: blueprint.configured,
      config: blueprint.config,
      configComponent: blueprint.configComponent ?? null,
    });

    initializeNodeConfig(node);

    return node;
  }
}
