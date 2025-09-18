import { ConfigAgentGroup } from "../configs/config-agent-group/config-agent-group";
import { ConfigAgent } from "../configs/config-agent/config-agent";
import { ConfigIf } from "../configs/config-if/config-if";
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
                    config: { message: 'Le traitement n\'a pas abouti' },
                });

            case 'if':
                return new GFlowNodeModel({
                    name: 'If',
                    type, x, y,
                    inputs: [{}],
                    outputs: [{ name: 'true' }, { name: 'false' }],
                    configured: false,
                    config: [{ left: '', operator: '==', right: '' }],
                    configComponent: ConfigIf
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
                    config: [{ field: '', value: '' }],
                });

            case 'sardine':
                return new GFlowNodeModel({
                    name: 'Sardine',
                    type, x, y,
                    inputs: [{}],
                    outputs: [
                        { name: 'valide', map: { sardine: { status: "success", type: "SARDINE_FILE_TYPE" } } },
                        { name: 'invalide', map: { sardine: { status: "error", type: "SARDINE_FILE_TYPE" } } },
                    ],
                    configured: false,
                    config: []
                });

            case 'agent':
                return new GFlowNodeModel({
                    name: 'Agent',
                    type, x, y,
                    inputs: [{}],
                    outputs: [{}],
                    exits: [{}],
                    configured: false,
                    config: { id: '' },
                    configComponent: ConfigAgent
                });

            case 'agent-group':
                return new GFlowNodeModel({
                    name: 'Agent groupé',
                    type, x, y,
                    inputs: [{}],
                    outputs: [{}],
                    entries: [{}, {}],
                    configured: false,
                    config: { map: {}, ids: [] },
                    configComponent: ConfigAgentGroup
                });

            default:
                throw new Error(`Unknown node type: ${type}`);
        }
    }
}
