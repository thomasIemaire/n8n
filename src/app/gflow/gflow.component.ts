import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { NodeIoPanelComponent } from '../shared/components/node-io-panel/node-io-panel.component';
import { GflowNodeComponent } from './node/gflow-node.component';
import { GFlowLink, GFlowNode, JsonValue, PortKind } from './core/gflow.types';
import { PaletteGroup, PaletteItem, PALETTE_GROUPS } from './core/node-definitions';
import { GflowViewportService } from './services/gflow-viewport.service';
import { GflowStateService } from './services/gflow-state.service';
import { GflowRendererService, PendingLink } from './services/gflow-renderer.service';
import { GflowConfigPanelComponent } from './components/gflow-config-panel/gflow-config-panel.component';
import { SwitchConfigEvent } from './configs/config-switch/config-switch.component';

@Component({
  selector: 'app-gflow',
  standalone: true,
  imports: [
    CommonModule,
    GflowNodeComponent,
    NodeIoPanelComponent,
    GflowConfigPanelComponent,
  ],
  templateUrl: './gflow.component.html',
  styleUrl: './gflow.component.scss',
  providers: [GflowViewportService, GflowStateService, GflowRendererService],
})
export class GflowComponent implements AfterViewInit, OnDestroy {
  constructor(
    private readonly cdr: ChangeDetectorRef,
    public readonly viewport: GflowViewportService,
    public readonly state: GflowStateService,
    private readonly renderer: GflowRendererService,
  ) {}

  @ViewChild('viewport', { static: true }) viewportRef!: ElementRef<HTMLElement>;

  readonly paletteGroups: PaletteGroup[] = PALETTE_GROUPS;

  paletteOpen = false;
  paletteSide: 'left' | 'right' = 'left';
  private readonly paletteWidth = 280;

  hoveredLinkId: string | null = null;
  private hoverFromPath = false;
  private hoverFromToolbar = false;
  private hideToolbarTimer: any = null;

  hoveredNodeId: string | null = null;
  private nodeHoverFromCard = false;
  private nodeHoverFromToolbar = false;
  private nodeHideTimer: any = null;

  focusedNode: GFlowNode | null = null;
  focusedInputMap: JsonValue | null = null;
  configOpen = false;

  draggingNode: GFlowNode | null = null;
  private dragDX = 0;
  private dragDY = 0;
  private dragMainStart = { x: 0, y: 0 };
  private dragGroup: Array<{ node: GFlowNode; x0: number; y0: number }> = [];

  pendingLink: PendingLink | null = null;

  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private panMoved = false;
  private skipNextClick = false;

  ngAfterViewInit(): void {
    this.renderer.initialize(this.viewportRef.nativeElement, () => this.cdr.markForCheck());
    this.refreshFocusedInputMap();
    this.renderer.schedule();
  }

  ngOnDestroy(): void {
    this.renderer.dispose();
    if (this.hideToolbarTimer) {
      clearTimeout(this.hideToolbarTimer);
    }
    if (this.nodeHideTimer) {
      clearTimeout(this.nodeHideTimer);
    }
  }

  get links(): GFlowLink[] {
    return this.state.links;
  }

  get nodes(): GFlowNode[] {
    return this.state.nodes;
  }

  get ox(): number {
    return this.viewport.ox;
  }

  get oy(): number {
    return this.viewport.oy;
  }

  get scale(): number {
    return this.viewport.scale;
  }

  get baseStep(): number {
    return this.viewport.baseStep;
  }

  get baseDot(): number {
    return this.viewport.baseDot;
  }

  get dotR(): number {
    return this.viewport.baseDot;
  }

  get nodeSize(): number {
    return this.viewport.nodeSize;
  }

  get pendingPreviewD(): string {
    return this.renderer.previewPath;
  }

  readonly nodeNameFn = (id: string) => this.state.nodeName(id);

  togglePalette(ev?: MouseEvent) {
    if (ev) {
      ev.stopPropagation();
    }
    this.paletteOpen = !this.paletteOpen;
  }

  onWheel(event: WheelEvent) {
    this.viewport.applyWheel(event);
    this.renderer.schedule();
  }

  onViewportMouseDown(event: MouseEvent) {
    if (event.button !== 0) {
      return;
    }
    if (this.draggingNode || this.pendingLink) {
      return;
    }

    this.isPanning = true;
    this.panMoved = false;
    this.panStart = { x: event.clientX, y: event.clientY };
  }

  onMouseMove(event: MouseEvent) {
    if (this.isPanning && (event.buttons & 1) && !this.draggingNode && !this.pendingLink) {
      if (!this.panMoved) {
        const dx0 = Math.abs(event.clientX - this.panStart.x);
        const dy0 = Math.abs(event.clientY - this.panStart.y);
        if (dx0 + dy0 > 3) {
          this.panMoved = true;
        }
      }

      this.viewport.moveBy(event.movementX, event.movementY);
      this.renderer.schedule();
      return;
    }
  }

  onDocMouseUp(event: MouseEvent) {
    if (this.isPanning) {
      if (this.panMoved) {
        this.skipNextClick = true;
      }
      this.isPanning = false;
      this.panMoved = false;
    }

    this.finishLink(event);
    this.draggingNode = null;
  }

  onViewportClick() {
    if (this.skipNextClick) {
      this.skipNextClick = false;
      return;
    }
    this.closeConfig();
  }

  addFromPalette(item: PaletteItem) {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const vx = this.paletteSide === 'left' && this.paletteOpen
      ? this.paletteWidth + 80
      : this.paletteSide === 'right' && this.paletteOpen
        ? rect.width - this.paletteWidth - 80
        : rect.width * 0.5;
    const vy = rect.height * 0.5;

    const world = this.viewport.toWorld(rect.left + vx, rect.top + vy);
    const x0 = this.viewport.snap(world.x - this.nodeSize / 2);
    const y0 = this.viewport.snap(world.y - this.nodeSize / 2);

    if (item.type === 'start' && this.state.hasStart()) {
      return;
    }

    const node = this.state.addNode(item.type, x0, y0);
    this.focusNode(node);
    this.openConfig();
    this.renderer.schedule();
  }

  onPaletteDragStart(event: DragEvent, item: PaletteItem) {
    event.dataTransfer?.setData('application/x-node', JSON.stringify(item));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onWorldDragOver(event: DragEvent) {
    if (event.dataTransfer?.types?.includes('application/x-node')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onWorldDrop(event: DragEvent) {
    const raw = event.dataTransfer?.getData('application/x-node');
    if (!raw) {
      return;
    }
    event.preventDefault();
    const item: PaletteItem = JSON.parse(raw);
    const world = this.viewport.toWorld(event.clientX, event.clientY);
    const x0 = this.viewport.snap(world.x - this.nodeSize / 2);
    const y0 = this.viewport.snap(world.y - this.nodeSize / 2);

    if (item.type === 'start' && this.state.hasStart()) {
      return;
    }

    const node = this.state.addNode(item.type, x0, y0);
    this.focusNode(node);
    this.openConfig();
    this.renderer.schedule();
  }

  focusNode(node: GFlowNode | null) {
    this.focusedNode = node;
    this.nodes.forEach((entry) => (entry.focused = entry.id === node?.id));
    this.refreshFocusedInputMap();
    this.cdr.markForCheck();
  }

  centerNode(node: GFlowNode) {
    this.focusNode(node);
    this.viewport.centerOn(node.x, node.y, this.nodeWidth(node), this.nodeHeight(node));
    this.openConfig();
    this.renderer.schedule();
  }

  deselectAll() {
    this.closeConfig();
  }

  openConfig() {
    this.configOpen = true;
    this.refreshFocusedInputMap();
  }

  closeConfig() {
    this.configOpen = false;
    this.focusNode(null);
  }

  get hoveredLink(): GFlowLink | null {
    return this.links.find((link) => link.id === this.hoveredLinkId) ?? null;
  }

  get hoveredNode(): GFlowNode | null {
    return this.nodes.find((node) => node.id === this.hoveredNodeId) ?? null;
  }

  enterLink(link: GFlowLink) {
    this.hoveredLinkId = link.id;
    this.hoverFromPath = true;
    if (this.hideToolbarTimer) {
      clearTimeout(this.hideToolbarTimer);
      this.hideToolbarTimer = null;
    }
  }

  leaveLink() {
    this.hoverFromPath = false;
    this.deferHideLinkToolbar();
  }

  enterToolbar() {
    this.hoverFromToolbar = true;
    if (this.hideToolbarTimer) {
      clearTimeout(this.hideToolbarTimer);
      this.hideToolbarTimer = null;
    }
  }

  leaveToolbar() {
    this.hoverFromToolbar = false;
    this.deferHideLinkToolbar();
  }

  private deferHideLinkToolbar() {
    if (this.hideToolbarTimer) {
      clearTimeout(this.hideToolbarTimer);
    }
    this.hideToolbarTimer = setTimeout(() => {
      if (!this.hoverFromPath && !this.hoverFromToolbar) {
        this.hoveredLinkId = null;
        this.cdr.markForCheck();
      }
      this.hideToolbarTimer = null;
    }, 150);
  }

  enterNode(node: GFlowNode) {
    this.hoveredNodeId = node.id;
    this.nodeHoverFromCard = true;
    this.clearNodeHideTimer();
  }

  leaveNode() {
    this.nodeHoverFromCard = false;
    this.deferHideNodeToolbar();
  }

  enterNodeToolbar() {
    this.nodeHoverFromToolbar = true;
    this.clearNodeHideTimer();
  }

  leaveNodeToolbar() {
    this.nodeHoverFromToolbar = false;
    this.deferHideNodeToolbar();
  }

  private clearNodeHideTimer() {
    if (this.nodeHideTimer) {
      clearTimeout(this.nodeHideTimer);
      this.nodeHideTimer = null;
    }
  }

  private deferHideNodeToolbar() {
    this.clearNodeHideTimer();
    this.nodeHideTimer = setTimeout(() => {
      if (!this.nodeHoverFromCard && !this.nodeHoverFromToolbar) {
        this.hoveredNodeId = null;
        this.cdr.markForCheck();
      }
      this.nodeHideTimer = null;
    }, 150);
  }

  deleteNode(node: GFlowNode) {
    if (this.focusedNode?.id === node.id) {
      this.closeConfig();
    }
    this.state.deleteNode(node.id);
    if (this.draggingNode?.id === node.id) {
      this.draggingNode = null;
    }
    if (this.hoveredNodeId === node.id) {
      this.hoveredNodeId = null;
    }
    this.afterGraphChange();
  }

  startDrag(event: MouseEvent, node: GFlowNode) {
    if ((event.target as HTMLElement)?.closest('.input-port, .output-port, .entry-port, .exit-port')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const world = this.viewport.toWorld(event.clientX, event.clientY);
    this.draggingNode = node;
    this.dragDX = world.x - node.x;
    this.dragDY = world.y - node.y;
    this.dragMainStart = { x: node.x, y: node.y };
    this.dragGroup = [];

    if (node.entries && node.entries.length) {
      const childIds = new Set<string>();
      for (let entryIdx = 0; entryIdx < node.entries.length; entryIdx++) {
        this.links.forEach((link) => {
          if (
            link.relation === 'entry-exit' &&
            link.src.nodeId === node.id &&
            link.src.kind === 'entry' &&
            link.src.portIndex === entryIdx &&
            link.dst.kind === 'exit'
          ) {
            childIds.add(link.dst.nodeId);
          }
        });
      }

      childIds.forEach((id) => {
        const child = this.nodes.find((item) => item.id === id);
        if (child && child.id !== node.id) {
          this.dragGroup.push({ node: child, x0: child.x, y0: child.y });
        }
      });
    }
  }

  onDocMouseMove(event: MouseEvent) {
    if (this.draggingNode) {
      const world = this.viewport.toWorld(event.clientX, event.clientY);
      this.draggingNode.x = this.viewport.snap(world.x - this.dragDX);
      this.draggingNode.y = this.viewport.snap(world.y - this.dragDY);

      const dx = this.draggingNode.x - this.dragMainStart.x;
      const dy = this.draggingNode.y - this.dragMainStart.y;

      for (const group of this.dragGroup) {
        group.node.x = this.viewport.snap(group.x0 + dx);
        group.node.y = this.viewport.snap(group.y0 + dy);
      }

      this.renderer.schedule();
    }

    if (this.pendingLink) {
      const world = this.viewport.toWorld(event.clientX, event.clientY);
      this.pendingLink = { ...this.pendingLink, mouse: world };
      this.renderer.updatePendingLink(this.pendingLink);
    }
  }

  onDocMouseDown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const portEl = target?.closest('.input-port, .output-port, .entry-port, .exit-port') as HTMLElement | null;
    if (!portEl) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.skipNextClick = true;

    const host = portEl.closest('[data-node-id]') as HTMLElement;
    const nodeId = host.getAttribute('data-node-id')!;
    const portIndex = Number(portEl.getAttribute('data-index') || 0);

    let kind: PortKind = 'in';
    if (portEl.classList.contains('output-port')) {
      kind = 'out';
    } else if (portEl.classList.contains('entry-port')) {
      kind = 'entry';
    } else if (portEl.classList.contains('exit-port')) {
      kind = 'exit';
    }

    const world = this.viewport.toWorld(event.clientX, event.clientY);
    this.pendingLink = { from: { nodeId, portIndex, kind }, mouse: world };
    this.renderer.updatePendingLink(this.pendingLink);
  }

  private finishLink(event: MouseEvent) {
    if (!this.pendingLink) {
      return;
    }

    const target = event.target as HTMLElement;
    const portEl = target?.closest('.input-port, .output-port, .entry-port, .exit-port') as HTMLElement | null;

    if (portEl) {
      const host = portEl.closest('[data-node-id]') as HTMLElement;
      const nodeId = host.getAttribute('data-node-id')!;
      const portIndex = Number(portEl.getAttribute('data-index') || 0);

      let kind: PortKind = 'in';
      if (portEl.classList.contains('output-port')) {
        kind = 'out';
      } else if (portEl.classList.contains('entry-port')) {
        kind = 'entry';
      } else if (portEl.classList.contains('exit-port')) {
        kind = 'exit';
      }

      const link = this.state.createLinkBetween(this.pendingLink.from, { nodeId, portIndex, kind });
      if (link) {
        this.afterGraphChange();
      }
    }

    this.pendingLink = null;
    this.renderer.updatePendingLink(null);
  }

  removeLink(link: GFlowLink) {
    const removed = this.state.removeLink(link.id);
    if (removed) {
      this.afterGraphChange();
    }
    if (this.hoveredLinkId === link.id) {
      this.hoveredLinkId = null;
    }
  }

  splitLink(link: GFlowLink) {
    const node = this.state.splitLink(link);
    if (node) {
      this.focusNode(node);
      this.renderer.schedule();
    }
  }

  onNodeConfigChange(event: unknown) {
    if (!this.focusedNode) {
      return;
    }

    if (this.isSwitchConfigEvent(event) && event.type === 'cases-changed') {
      const remap = this.buildCaseRemap(event.previousCaseIds, event.config.cases.map((item) => item.id));
      this.state.updateNodeOutputs(
        this.focusedNode.id,
        event.config.cases.map((item) => ({ name: item.name })),
        remap,
      );
    }

    if (this.isGroupEntryRemoved(event)) {
      this.state.removeGroupEntry(this.focusedNode, event.index);
    }

    if (this.isGroupEntriesChanged(event)) {
      this.state.recomputeDownstreamFrom(this.focusedNode.id);
    }

    for (const groupId of this.state.parentAgentGroupsOf(this.focusedNode.id)) {
      this.state.recomputeDownstreamFrom(groupId);
    }

    this.state.recomputeDownstreamFrom(this.focusedNode.id);
    this.afterGraphChange();
  }

  get focusedInputLinks(): GFlowLink[][] {
    if (!this.focusedNode?.inputs?.length) {
      return [];
    }
    return this.focusedNode.inputs.map((_port, index) => this.state.inputLinks(this.focusedNode!.id, index));
  }

  get focusedOutputLinks(): GFlowLink[][] {
    if (!this.focusedNode?.outputs?.length) {
      return [];
    }
    return this.focusedNode.outputs.map((_port, index) => this.state.outputLinks(this.focusedNode!.id, index));
  }

  trackByLinkId(_index: number, link: GFlowLink) {
    return link.id;
  }

  nodeUsesExit(node: GFlowNode): boolean {
    return this.links.some(
      (link) =>
        (link.src.nodeId === node.id && link.src.kind === 'exit') ||
        (link.dst.nodeId === node.id && link.dst.kind === 'exit'),
    );
  }

  nodeUsesIO(node: GFlowNode): boolean {
    return this.links.some(
      (link) =>
        (link.src.nodeId === node.id && (link.src.kind === 'out' || link.src.kind === 'in')) ||
        (link.dst.nodeId === node.id && (link.dst.kind === 'out' || link.dst.kind === 'in')),
    );
  }

  exitHidden(node: GFlowNode) {
    return node.type === 'agent' && this.nodeUsesIO(node);
  }

  ioHidden(node: GFlowNode) {
    return node.type === 'agent' && this.nodeUsesExit(node);
  }

  nodeWidth(node: GFlowNode): number {
    const entries = node.entries?.length ?? 0;
    return this.nodeSize * Math.max(entries, 1);
  }

  nodeHeight(node: GFlowNode): number {
    if (node.type === 'switch') {
      const outputs = node.outputs?.length ?? 1;
      const extra = Math.max(outputs - 1, 0) * (this.baseStep * 1.5);
      return this.nodeSize + extra;
    }
    return this.nodeSize;
  }

  private refreshFocusedInputMap() {
    this.focusedInputMap = this.focusedNode ? this.state.aggregatedInputMap(this.focusedNode.id) : null;
  }

  private afterGraphChange() {
    this.refreshFocusedInputMap();
    this.renderer.schedule();
    this.cdr.markForCheck();
  }

  private isGroupEntryRemoved(event: unknown): event is { type: 'entry-removed'; index: number } {
    return typeof event === 'object' && event !== null && (event as any).type === 'entry-removed';
  }

  private isGroupEntriesChanged(event: unknown): event is { type: 'entries-changed' } {
    return typeof event === 'object' && event !== null && (event as any).type === 'entries-changed';
  }

  private isSwitchConfigEvent(event: unknown): event is SwitchConfigEvent {
    return (
      typeof event === 'object' &&
      event !== null &&
      ((event as SwitchConfigEvent).type === 'cases-changed' || (event as SwitchConfigEvent).type === 'config-updated') &&
      'config' in (event as SwitchConfigEvent)
    );
  }

  private buildCaseRemap(previous: string[] | undefined, next: string[]): Map<number, number> {
    const mapping = new Map<number, number>();
    if (!previous) {
      return mapping;
    }

    previous.forEach((id, index) => {
      const nextIndex = next.indexOf(id);
      if (nextIndex >= 0) {
        mapping.set(index, nextIndex);
      }
    });

    return mapping;
  }
}
