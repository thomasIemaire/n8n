import { GFlowNode, GFlowNodeModel } from "../gflow";

export class NodeFactory {

    public static createNode(type: string, x: number, y: number): GFlowNode {
        switch (type) {
            case 'start':
                return new GFlowNodeModel({
                    type,
                    x,
                    y,
                    inputs: [],
                    outputs: [{}]
                });
            case 'end':
                return new GFlowNodeModel({
                    type,
                    x,
                    y,
                    inputs: [{}],
                    outputs: []
                });
            case 'agent':
                return new GFlowNodeModel({
                    type,
                    x,
                    y,
                    inputs: [{}],
                    outputs: [{}]
                });
            case 'if':
                return new GFlowNodeModel({
                    type,
                    x,
                    y,
                    inputs: [{}],
                    outputs: [{ name: 'true' }, { name: 'false' }]
                });
            default:
                throw new Error(`Unknown node type: ${type}`);
        }
    }
}