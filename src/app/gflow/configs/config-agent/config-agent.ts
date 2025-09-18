import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GFlowNode } from '../../core/gflow.types';
import { SelectModule } from 'primeng/select';
import {
  AGENT_CATALOG,
  AgentConfig,
  versionsForAgent,
  ensureAgentConfig,
  resolveAgentVersionMap,
} from './agent-config';

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
    this.applyToNode();
  }

  onAgentChange(name: string) {
    this.selectedAgentName = name;
    const versions = this.versionsForSelected;
    this.selectedVersion = versions[0]?.version ?? '';
    this.applyToNode();
  }

  onVersionChange(ver: string) {
    this.selectedVersion = ver;
    this.applyToNode();
  }

  private applyToNode() {
    const cfg = ensureAgentConfig(this.node, this.agents);
    cfg.agentName = this.selectedAgentName;
    cfg.version = this.selectedVersion;

    if (this.node?.outputs?.length) {
      this.node.outputs[0] = {
        ...this.node.outputs[0],
        map: resolveAgentVersionMap(this.agents, cfg.agentName, cfg.version),
      };
    }

    this.configChange.emit({ ...cfg });
  }
}