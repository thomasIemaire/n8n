import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ConfigBase } from '../../../shared/components/config-base/config-base';
import { GFlowLink, GFlowNode, JsonValue } from '../../core/gflow.types';

@Component({
  selector: 'app-gflow-config-panel',
  standalone: true,
  imports: [CommonModule, ConfigBase],
  templateUrl: './gflow-config-panel.component.html',
  styleUrl: './gflow-config-panel.component.scss',
})
export class GflowConfigPanelComponent implements OnChanges {
  @Input() node: GFlowNode | null = null;
  @Input() nodes: GFlowNode[] = [];
  @Input() links: GFlowLink[] = [];
  @Input() inputMap: JsonValue | null = null;

  @Output() cancel = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() configChange = new EventEmitter<unknown>();

  componentInputs: Record<string, unknown> | null = null;

  ngOnChanges(changes: SimpleChanges) {
    if (!this.node?.configComponent) {
      this.componentInputs = null;
      return;
    }

    if (changes['node'] || changes['nodes'] || changes['links'] || changes['inputMap']) {
      this.componentInputs = {
        node: this.node,
        nodes: this.nodes,
        links: this.links,
        inputMap: this.cloneJson(this.inputMap),
      };
    }
  }

  private cloneJson<T>(value: T): T {
    return value === null || value === undefined ? (value as T) : JSON.parse(JSON.stringify(value));
  }
}
