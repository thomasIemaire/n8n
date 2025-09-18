import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { GFlowNode } from '../../core/gflow.types';
import { Condition, IF_OPERATORS, cloneConditions, createCondition } from './if-config';

@Component({
  selector: 'app-config-if',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, InputTextModule, ButtonModule],
  template: `
  <div class="config__wrapper">
    <div class="cond-row" *ngFor="let c of conditions; let i = index">
      <p-select
        size="small"
        [options]="keys"
        [(ngModel)]="c.left"
        placeholder="clé"
        [showClear]="true"
        styleClass="w-full mb-2"
        (onChange)="emit()" />

      <p-select
        size="small"
        [options]="operators"
        optionLabel="label" optionValue="value"
        [(ngModel)]="c.operator"
        placeholder="opérateur"
        styleClass="w-full mb-2"
        (onChange)="emit()" />

      <div class="right-wrapper">
        <label class="toggle">
          <input type="checkbox" [(ngModel)]="c.rightIsKey" (ngModelChange)="emit()" />
          utiliser une clé comme droite
        </label>

        <ng-container *ngIf="c.rightIsKey; else literal">
          <p-select
            size="small"
            [options]="keys"
            [(ngModel)]="c.right"
            placeholder="clé de comparaison"
            [showClear]="true"
            styleClass="w-full"
            (onChange)="emit()" />
        </ng-container>
        <ng-template #literal>
          <input
            pSize="small"
            pInputText
            [(ngModel)]="c.right"
            (ngModelChange)="emit()"
            placeholder="valeur" />
        </ng-template>
      </div>

      <div class="row-actions">
        <p-button size="small" severity="danger" text icon="pi pi-trash" (click)="remove(i)" />
      </div>
      <hr />
    </div>

    <p-button size="small" severity="secondary" icon="pi pi-plus" (click)="add()" />
  </div>
  `,
  styles: [`
    .cond-row { margin-bottom: .5rem; }
    .right-wrapper { display: grid; gap: .25rem; }
    .toggle { font-size: .85rem; opacity: .9; display: flex; gap: .5rem; align-items: center; }
    hr { border: none; border-top: 1px solid var(--surface-300); margin: .5rem 0; }
  `]
})
export class ConfigIf implements OnInit, OnChanges {
  @Input() node!: GFlowNode;
  /** Map d'entrée agrégée (JSON) fournie par le parent */
  @Input() inputMap: any = {};
  @Output() configChange = new EventEmitter<Condition[]>();

  public conditions: Condition[] = [];
  public keys: string[] = [];
  public operators = IF_OPERATORS;

  ngOnInit() { this.syncFromNode(); this.refreshKeys(); }
  ngOnChanges(changes: SimpleChanges) {
    if (changes['node']) this.syncFromNode();
    if (changes['inputMap']) this.refreshKeys();
  }

  private syncFromNode() {
    const config = (this.node.config as { conditions?: Condition[] } | undefined) ?? {};
    const source = Array.isArray(config.conditions) && config.conditions.length
      ? config.conditions
      : [createCondition()];

    this.node.config = { ...config, conditions: cloneConditions(source) };
    this.conditions = cloneConditions(source);
  }

  private refreshKeys() {
    this.keys = this.flattenKeys(this.inputMap);
  }

  private flattenKeys(obj: any, base = ''): string[] {
    const out: string[] = [];
    const walk = (v: any, pref: string) => {
      if (v === null || v === undefined) { out.push(pref || '$'); return; }
      if (Array.isArray(v)) {
        // On ne détaille pas les indices; on expose la clé comme tableau
        out.push(pref || '$');
        // si tu veux exposer les enfants: v.forEach((it, idx)=> walk(it, pref?`${pref}[${idx}]`:`[${idx}]`));
        return;
      }
      if (typeof v === 'object') {
        const keys = Object.keys(v);
        if (!keys.length) { out.push(pref || '$'); return; }
        for (const k of keys) {
          const next = pref ? `${pref}.${k}` : k;
          walk(v[k], next);
        }
        return;
      }
      // scalaire
      out.push(pref || '$');
    };
    walk(obj, base);
    // unicité + tri
    return Array.from(new Set(out)).sort();
  }

  add() {
    this.conditions.push(createCondition());
    this.emit();
  }
  remove(i: number) {
    this.conditions.splice(i, 1);
    this.emit();
  }

  emit() {
    const snapshot = cloneConditions(this.conditions);
    this.node.config = { ...(this.node.config as any), conditions: snapshot };
    this.configChange.emit(snapshot);
  }
}
