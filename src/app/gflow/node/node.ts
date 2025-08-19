import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GFlowNode } from '../gflow';

@Component({
  selector: 'app-node',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './node.html',
  styleUrls: ['./node.scss']
})
export class Node {
  @Input({ required: true })
  public item!: GFlowNode;
}
