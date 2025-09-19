import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GFlowNode } from '../core/gflow.types';

@Component({
  selector: 'app-gflow-node',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gflow-node.component.html',
  styleUrls: ['./gflow-node.component.scss']
})
export class GflowNodeComponent {
  @Input({ required: true })
  item!: GFlowNode;

  @Input()
  width = 0;

  @Input()
  height = 0;
}
