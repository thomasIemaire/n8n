import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GFlowNode } from '../../gflow';
import { SelectModule } from 'primeng/select';

type AgentVer = { version: string; map: any };
type Agent = { name: string; versions: AgentVer[] };

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
  @Output() configChange = new EventEmitter<any>();

  // === catalogue (exemples)
  public agents: Agent[] = [
    {
      name: 'adrs', versions: [
        {
          version: '1.0', map: {
            address: {
              city: 'ADDRESS_ADDRESS_CITY',
              country: 'ADDRESS_ADDRESS_COUNTRY',
              name: 'ADDRESS_ADDRESS_NAME',
              street: 'ADDRESS_ADDRESS_STREET',
              'zip-code': 'ADDRESS_ADDRESS_ZIP-CODE'
            }
          }
        }
      ]
    },
    {
      name: 'gpt-3.5-turbo', versions: [
        { version: '1.0', map: { input: 'GPT_3_5_TURBO_INPUT' } },
        { version: '1.1', map: { input: 'GPT_3_5_TURBO_INPUT_1.1' } }
      ]
    },
    {
      name: 'gpt-4', versions: [
        { version: '1.0', map: { input: 'GPT_4_INPUT' } },
        { version: '1.1', map: { input: 'GPT_4_INPUT_1.1' } }
      ]
    }
  ];

  // états “persistables”
  public selectedAgentName = '';
  public selectedVersion = '';

  get versionsForSelected(): AgentVer[] {
    const a = this.agents.find(x => x.name === this.selectedAgentName);
    return a?.versions ?? [];
  }

  ngOnInit() { this.syncFromNode(); }
  ngOnChanges(_c: SimpleChanges) { this.syncFromNode(); }

  private syncFromNode() {
    (this.node as any).config ??= {};
    const cfg: any = this.node.config;
    if (!cfg.agentName) cfg.agentName = this.agents[0].name;
    if (!cfg.version) cfg.version = this.agents[0].versions[0].version;

    this.selectedAgentName = cfg.agentName;
    this.selectedVersion = cfg.version;
    this.applyToNode(); // assure la map de l’output
  }

  onAgentChange(name: string) {
    this.selectedAgentName = name;
    this.selectedVersion = this.versionsForSelected[0]?.version ?? '';
    this.applyToNode();
  }
  onVersionChange(ver: string) {
    this.selectedVersion = ver;
    this.applyToNode();
  }

  private applyToNode() {
    (this.node as any).config.agentName = this.selectedAgentName;
    (this.node as any).config.version = this.selectedVersion;

    const map = this.findVersionMap(this.selectedAgentName, this.selectedVersion);
    if (this.node?.outputs?.length) {
      this.node.outputs[0] = { ...this.node.outputs[0], map };
    }

    this.configChange.emit({ agentName: this.selectedAgentName, version: this.selectedVersion });
  }

  private findVersionMap(name: string, ver: string) {
    return this.agents.find(a => a.name === name)?.versions.find(v => v.version === ver)?.map ?? {};
  }
}