import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { GFlowNode, GFlowPort, JsonValue } from '../../core/gflow.types';

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

export const versionsForAgent = (
  catalog: AgentDefinition[],
  agentName: string,
): AgentVersion[] => catalog.find((agent) => agent.name === agentName)?.versions ?? [];

export const createAgentConfig = (catalog: AgentDefinition[] = AGENT_CATALOG): AgentConfig => ({
  agentName: catalog[0]?.name ?? '',
  version: catalog[0]?.versions[0]?.version ?? '',
});

export const resolveAgentVersionMap = (
  catalog: AgentDefinition[] = AGENT_CATALOG,
  agentName: string,
  version: string,
): JsonValue => {
  const agent = catalog.find((item) => item.name === agentName);
  const map = agent?.versions.find((entry) => entry.version === version)?.map ?? {};
  return cloneJson(map);
};

const syncAgentOutputMap = (
  node: GFlowNode,
  cfg: AgentConfig,
  catalog: AgentDefinition[] = AGENT_CATALOG,
) => {
  if (!node?.outputs?.length) {
    return;
  }

  node.outputs[0] = {
    ...node.outputs[0],
    map: resolveAgentVersionMap(catalog, cfg.agentName, cfg.version),
  };
};

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
  syncAgentOutputMap(node, normalized, catalog);
  return normalized;
};

export const updateAgentConfig = (
  node: GFlowNode,
  updates: Partial<AgentConfig>,
  catalog: AgentDefinition[] = AGENT_CATALOG,
): AgentConfig => {
  const cfg = ensureAgentConfig(node, catalog);

  if (updates.agentName !== undefined) {
    cfg.agentName = updates.agentName;
    if (updates.version === undefined) {
      const versions = versionsForAgent(catalog, cfg.agentName);
      cfg.version = versions[0]?.version ?? '';
    }
  }

  if (updates.version !== undefined) {
    cfg.version = updates.version;
  }

  syncAgentOutputMap(node, cfg, catalog);
  return { ...cfg };
};

export const createAgentOutputPorts = (
  catalog: AgentDefinition[] = AGENT_CATALOG,
): GFlowPort[] => {
  const defaults = createAgentConfig(catalog);
  return [
    {
      map: resolveAgentVersionMap(catalog, defaults.agentName, defaults.version),
    },
  ];
};

@Component({
  selector: 'app-config-agent',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule],
  template: `
  <div class="config__wrapper">
    <p-select
      [options]="agents" optionLabel="name" optionValue="name" size="small"
      [(ngModel)]="selectedAgentName" (onChange)="onAgentChange($event.value)"/>

    <p-select
      [options]="versionsForSelected" optionLabel="version" optionValue="version" size="small"
      [(ngModel)]="selectedVersion" (onChange)="onVersionChange($event.value)"/>
  </div>`

})
export class ConfigAgent implements OnInit, OnChanges {
  @Input() node!: GFlowNode;
  @Output() configChange = new EventEmitter<AgentConfig>();

  public readonly agents = AGENT_CATALOG;

  // états “persistables”
  public selectedAgentName = '';
  public selectedVersion = '';

  get versionsForSelected() {
    return versionsForAgent(this.agents, this.selectedAgentName);
  }

  ngOnInit() {
    this.syncFromNode();
  }

  ngOnChanges(_c: SimpleChanges) {
    this.syncFromNode();
  }

  private syncFromNode() {
    const cfg = ensureAgentConfig(this.node, this.agents);
    this.selectedAgentName = cfg.agentName;
    this.selectedVersion = cfg.version;
    this.emitConfig();
  }

  onAgentChange(name: string) {
    this.selectedAgentName = name;
    const versions = this.versionsForSelected;
    this.selectedVersion = versions[0]?.version ?? '';
    this.emitConfig();
  }

  onVersionChange(ver: string) {
    this.selectedVersion = ver;
    this.emitConfig();
  }

  private emitConfig() {
    const snapshot = updateAgentConfig(
      this.node,
      { agentName: this.selectedAgentName, version: this.selectedVersion },
      this.agents,
    );
    this.configChange.emit(snapshot);
  }
}