import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { GFlowNode, JsonValue } from '../../core/gflow.types';
import { flattenInputKeys } from '../utils/input-map.utils';

export interface SwitchCaseConfig {
  id: string;
  name: string;
  value: string;
}

export interface SwitchConfig {
  key: string;
  cases: SwitchCaseConfig[];
}

export type SwitchConfigEvent =
  | { type: 'config-updated'; config: SwitchConfig; previousCaseIds?: string[] }
  | { type: 'cases-changed'; config: SwitchConfig; previousCaseIds?: string[] };

const createCaseId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createSwitchConfig = (): SwitchConfig => ({
  key: '',
  cases: [createSwitchCase('Case 1')],
});

export const cloneSwitchConfig = (config: SwitchConfig): SwitchConfig => ({
  key: config.key,
  cases: config.cases.map((item) => ({ ...item })),
});

export const ensureSwitchConfig = (node: GFlowNode): SwitchConfig => {
  const raw = node.config as SwitchConfig | undefined;
  if (!isSwitchConfig(raw)) {
    node.config = createSwitchConfig();
  }

  const normalized = node.config as SwitchConfig;
  normalized.key ??= '';
  normalized.cases = Array.isArray(normalized.cases) && normalized.cases.length
    ? normalized.cases.map((item, index) => ({
        id: item.id || createCaseId(),
        name: item.name || `Case ${index + 1}`,
        value: item.value ?? '',
      }))
    : createSwitchConfig().cases;

  node.outputs = normalized.cases.map((item) => ({ name: item.name }));

  return normalized;
};

const createSwitchCase = (name: string): SwitchCaseConfig => ({
  id: createCaseId(),
  name,
  value: '',
});

const isSwitchConfig = (value: unknown): value is SwitchConfig => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as SwitchConfig;
  return Array.isArray(candidate.cases);
};

@Component({
  selector: 'app-config-switch',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, InputTextModule, ButtonModule],
  templateUrl: './config-switch.component.html',
  styleUrls: ['./config-switch.component.scss'],
})
export class ConfigSwitchComponent implements OnInit, OnChanges {
  @Input() node!: GFlowNode;
  @Input() inputMap: JsonValue | null = null;

  @Output() configChange = new EventEmitter<SwitchConfigEvent>();

  keys: string[] = [];
  config: SwitchConfig = createSwitchConfig();

  ngOnInit() {
    this.syncFromNode();
    this.refreshKeys();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['node']) {
      this.syncFromNode();
    }
    if (changes['inputMap']) {
      this.refreshKeys();
    }
  }

  addCase() {
    const nextIndex = this.config.cases.length + 1;
    this.config.cases.push(createSwitchCase(`Case ${nextIndex}`));
    this.emit('cases-changed');
  }

  removeCase(index: number) {
    if (this.config.cases.length <= 1) {
      return;
    }
    this.config.cases.splice(index, 1);
    this.emit('cases-changed');
  }

  onKeyChange(key: string) {
    this.config.key = key;
    this.emit('config-updated');
  }

  onCaseNameChange(index: number, name: string) {
    this.config.cases[index].name = name;
    this.emit('cases-changed');
  }

  onCaseValueChange(index: number, value: string) {
    this.config.cases[index].value = value;
    this.emit('config-updated');
  }

  private syncFromNode() {
    if (!this.node) {
      return;
    }
    const normalized = ensureSwitchConfig(this.node);
    this.config = cloneSwitchConfig(normalized);
  }

  private refreshKeys() {
    this.keys = flattenInputKeys(this.inputMap ?? {});
  }

  private emit(type: SwitchConfigEvent['type']) {
    const normalized = ensureSwitchConfig(this.node);
    const previousIds = normalized.cases.map((item) => item.id);
    normalized.key = this.config.key;
    normalized.cases = this.config.cases.map((item) => ({ ...item }));
    this.configChange.emit({ type, config: cloneSwitchConfig(normalized), previousCaseIds: previousIds });
  }
}
