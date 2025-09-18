// config-agent-group.component.ts
import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { GFlowNode } from '../../core/gflow.types';
import { ensureAgentGroupConfig } from './agent-group-config';

type ConfigEvent =
  | { type: 'entries-changed' }
  | { type: 'entry-removed'; index: number };

interface AgentGroupRow {
  agent: GFlowNode | null;
}

@Component({
  selector: 'app-config-agent-group',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  template: `
  <div class="config__wrapper">
    <div class="header">
      <h3>Agent groupé</h3>
      <p-button size="small" severity="secondary" icon="pi pi-plus" (click)="add()" />
    </div>

    <div class="rows">
      <div class="row" *ngFor="let row of view; let i = index">
        <div class="entry-col">Entry {{ i }}</div>
        <div class="arrow">⟶</div>
        <div class="agent-col" [class.missing]="!row.agent">
          <ng-container *ngIf="row.agent as agent; else noLink">
            <strong>{{ agent.name || 'Agent' }}</strong>
            <span class="muted">({{ $any(agent.config)?.agentName || 'n/a' }} – {{ $any(agent.config)?.version || 'n/a' }})</span>
          </ng-container>
          <ng-template #noLink><em>non relié</em></ng-template>
        </div>
        <div class="tools">
          <p-button size="small" severity="danger" text icon="pi pi-trash" (click)="remove(i)" />
        </div>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem}
    .rows{display:grid;gap:.5rem}
    .row{display:grid;grid-template-columns:100px 24px 1fr 32px;align-items:center}
    .entry-col{font-weight:600}
    .agent-col .muted{opacity:.7;margin-left:.25rem}
    .agent-col.missing{opacity:.7;font-style:italic}
  `]
})
export class ConfigAgentGroup implements OnInit, OnChanges {
  @Input() node!: GFlowNode;
  @Input() nodes: GFlowNode[] = [];
  @Input() links: any[] = [];

  @Output() configChange = new EventEmitter<ConfigEvent>();

  public view: AgentGroupRow[] = [];

  ngOnInit() { this.refresh(); }
  ngOnChanges(_c: SimpleChanges) { this.refresh(); }

  add() {
    this.node.entries ??= [];
    this.node.entries.push({});
    this.persistIds();
    this.configChange.emit({ type: 'entries-changed' });
  }

  remove(i: number) {
    // le parent gère le ménage (liens + reindex), on lui envoie l'index
    this.configChange.emit({ type: 'entry-removed', index: i });
  }

  private refresh() {
    if (!this.node) return;
    const cnt = this.node.entries?.length ?? 0;
    const cfg = ensureAgentGroupConfig(this.node);
    const children: string[] = [];

    this.view = Array.from({ length: cnt }).map((_, idx) => {
      const lk = this.links.find(l =>
        l.relation === 'entry-exit' &&
        l.src.nodeId === this.node.id && l.src.kind === 'entry' && l.src.portIndex === idx &&
        l.dst.kind === 'exit'
      );
      const child = lk ? (this.nodes.find(n => n.id === lk.dst.nodeId) || null) : null;
      if (child) children.push(child.id);
      return { agent: child };
    });

    cfg.ids = children;
  }

  private persistIds() {
    ensureAgentGroupConfig(this.node);
  }
}
