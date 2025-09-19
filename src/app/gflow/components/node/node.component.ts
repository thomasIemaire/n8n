import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GFlowNode } from '../../core/gflow.types';

@Component({
  selector: 'app-node',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './node.component.html',
  styleUrls: ['./node.component.scss']
})
export class NodeComponent {
  @Input({ required: true })
  public item!: GFlowNode;

  public get width(): number {
    const BASE = 24;
    const MULTIPLIER = 4;
    const ENTRIES = Math.max(this.item.entries!.length, 0);
    return BASE * MULTIPLIER * ENTRIES;
  }
}
