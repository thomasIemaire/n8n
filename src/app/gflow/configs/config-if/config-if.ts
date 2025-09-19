import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { GFlowNode } from '../../core/gflow.types';
import { flattenInputKeys } from '../utils/input-map.utils';

export interface Condition {
  left: string;
  operator: string;
  right: unknown;
  rightIsKey?: boolean;
}

export interface IfConfig {
  conditions: Condition[];
}

export const createCondition = (): Condition => ({
  left: '',
  operator: '==',
  right: '',
});

export const cloneConditions = (conditions: Condition[]): Condition[] =>
  conditions.map((condition) => ({ ...condition }));

export const createIfConfig = (): IfConfig => ({
  conditions: [createCondition()],
});

const isIfConfig = (value: unknown): value is IfConfig =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const ensureIfConfig = (node: GFlowNode): IfConfig => {
  const cfg = node.config as IfConfig | undefined;
  const source = isIfConfig(cfg) && Array.isArray(cfg.conditions) && cfg.conditions.length
    ? cfg.conditions
    : createIfConfig().conditions;

  const normalized: IfConfig = {
    conditions: cloneConditions(source),
  };

  node.config = normalized;
  return normalized;
};

export const applyIfConditions = (node: GFlowNode, conditions: Condition[]): Condition[] => {
  const normalized = ensureIfConfig(node);
  const cloned = cloneConditions(conditions);
  normalized.conditions = cloned;
  return cloneConditions(cloned);
};

export const IF_OPERATORS = [
  { label: '== égal', value: '==' },
  { label: '!= différent', value: '!=' },
  { label: '> supérieur', value: '>' },
  { label: '>= supérieur ou égal', value: '>=' },
  { label: '< inférieur', value: '<' },
  { label: '<= inférieur ou égal', value: '<=' },
  { label: 'contient', value: 'contains' },
  { label: 'commence par', value: 'startsWith' },
  { label: 'est vide', value: 'isEmpty' },
  { label: 'n’est pas vide', value: 'notEmpty' },
];

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
    const cfg = ensureIfConfig(this.node);
    this.conditions = cloneConditions(cfg.conditions);
  }

  private refreshKeys() {
    this.keys = flattenInputKeys(this.inputMap);
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
    const snapshot = applyIfConditions(this.node, this.conditions);
    this.configChange.emit(snapshot);
  }
}
