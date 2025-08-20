import { GFlowNode, GFlowNodeModel } from "../gflow";

export class NodeFactory {
    public static createNode(type: string, x: number, y: number): GFlowNode {
        switch (type) {
            case 'start':
                return new GFlowNodeModel({
                    name: 'Start',
                    type, x, y,
                    inputs: [],
                    outputs: [{}],
                });

            case 'end-success':
                return new GFlowNodeModel({
                    name: 'Fin (Réussite)',
                    type, x, y,
                    inputs: [{}],
                    outputs: [],
                });

            case 'end-error':
                return new GFlowNodeModel({
                    name: 'Fin (Erreur)',
                    type, x, y,
                    inputs: [{}],
                    outputs: [],
                });

            case 'if':
                return new GFlowNodeModel({
                    name: 'If',
                    type, x, y,
                    inputs: [{}],
                    outputs: [{ name: 'true' }, { name: 'false' }],
                    configured: false,
                });

            case 'merge':
                return new GFlowNodeModel({
                    name: 'Merge',
                    type, x, y,
                    inputs: [{}],
                    outputs: [{}],
                    configured: false,
                });

            case 'edit':
                return new GFlowNodeModel({
                    name: 'Edit',
                    type, x, y,
                    inputs: [{}],
                    outputs: [{}],
                    configured: false,
                });

            case 'sardine':
                return new GFlowNodeModel({
                    name: 'Sardine',
                    type, x, y,
                    inputs: [{}],
                    outputs: [{}, {}],
                    configured: false,
                });

            case 'agent':
                return new GFlowNodeModel({
                    name: 'Agent',
                    type, x, y,
                    inputs: [{}],
                    outputs: [{}],
                    configured: false,
                });

            case 'agent-group':
                return new GFlowNodeModel({
                    name: 'Agent groupé',
                    type, x, y,
                    inputs: [{}],
                    outputs: [{}],
                    configured: false,
                });

            default:
                throw new Error(`Unknown node type: ${type}`);
        }
    }
}
