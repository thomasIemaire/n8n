import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ComponentRef,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { NodeComponent } from '../node/node.component';
import { GFlowLink, GFlowNode, PortKind, PortRef } from '../../core/gflow.types';
import { PaletteGroup, PaletteItem, PALETTE_GROUPS } from '../../core/node-definitions';
import { GflowStateService } from '../../services/gflow-state.service';
import { LinkRoutingService, PendingLink } from '../../services/link-routing.service';
import { ViewportService } from '../../services/viewport.service';

@Component({
  selector: 'app-gflow',
  standalone: true,
  imports: [CommonModule, NodeComponent, TabsModule],
  templateUrl: './gflow.component.html',
  styleUrls: ['./gflow.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GflowStateService, LinkRoutingService, ViewportService],
})
export class GflowComponent implements AfterViewInit, OnDestroy {
  constructor(
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef,
    private readonly state: GflowStateService,
    private readonly linkRouting: LinkRoutingService,
    public readonly camera: ViewportService,
  ) {}

  @ViewChild('viewport', { static: true }) viewportRef!: ElementRef<HTMLElement>;
  @ViewChild('configHost', { read: ViewContainerRef }) configHost!: ViewContainerRef;

  private configCmpRef: ComponentRef<any> | null = null;

  readonly baseStep = 24;
  readonly baseDot = 1;
  readonly paletteGroups: PaletteGroup[] = PALETTE_GROUPS;

  paletteOpen = false;
  paletteSide: 'left' | 'right' = 'left';
  private readonly paletteWidth = 280;

  focusedNode: GFlowNode | null = null;
  hoveredLinkId: string | null = null;
  hoveredNodeId: string | null = null;

  pendingLink: PendingLink | null = null;
  pendingPreviewD = '';

  draggingNode: GFlowNode | null = null;
  private dragDX = 0;
  private dragDY = 0;
  private dragMainStart = { x: 0, y: 0 };
  private dragGroup: Array<{ node: GFlowNode; x0: number; y0: number }> = [];

  private hoverFromPath = false;
  private hoverFromToolbar = false;
  private hideToolbarTimer: any = null;

  private nodeHoverFromCard = false;
  private nodeHoverFromToolbar = false;
  private nodeHideTimer: any = null;

  configOpen = false;
  private rafId: number | null = null;

  get nodes(): GFlowNode[] {
    return this.state.nodes;
  }

  get links(): GFlowLink[] {
    return this.state.links;
  }

  get dotR(): number {
    return this.baseDot;
  }

  get nodeSize(): number {
    return 4 * this.baseStep;
  }

  get hoveredLink(): GFlowLink | null {
    return this.links.find((link) => link.id === this.hoveredLinkId) ?? null;
  }

  get hoveredNode(): GFlowNode | null {
    return this.nodes.find((node) => node.id === this.hoveredNodeId) ?? null;
  }

  nodeName(id: string): string {
    return this.state.nodeName(id);
  }

  inputLinksFor(idx: number): GFlowLink[] {
    return this.focusedNode ? this.state.inputLinksFor(this.focusedNode.id, idx) : [];
  }

  outputLinksFor(idx: number): GFlowLink[] {
    return this.focusedNode ? this.state.outputLinksFor(this.focusedNode.id, idx) : [];
  }

  trackByLinkId(_: number, link: GFlowLink): string {
    return link.id;
  }

  enterLink(link: GFlowLink): void {
    this.hoveredLinkId = link.id;
    this.hoverFromPath = true;
    if (this.hideToolbarTimer) {
      clearTimeout(this.hideToolbarTimer);
      this.hideToolbarTimer = null;
    }
  }

  leaveLink(): void {
    this.hoverFromPath = false;
    this.maybeHideToolbar();
  }

  enterToolbar(): void {
    this.hoverFromToolbar = true;
    if (this.hideToolbarTimer) {
      clearTimeout(this.hideToolbarTimer);
      this.hideToolbarTimer = null;
    }
  }

  leaveToolbar(): void {
    this.hoverFromToolbar = false;
    this.maybeHideToolbar();
  }

  private maybeHideToolbar(): void {
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

  focusNode(node: GFlowNode | null): void {
    this.focusedNode = node;
    this.state.setFocusedNode(node?.id ?? null);
    this.cdr.markForCheck();
    this.loadConfigComponent();
  }

  deselectAll(): void {
    this.closeConfig();
  }

  centerNode(node: GFlowNode): void {
    this.focusNode(node);
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const vx = rect.width / 2;
    const vy = rect.height / 2;
    const wx = node.x + this.realNodeSize(node) / 2;
    const wy = node.y + this.realNodeSize(node) / 2;
    this.camera.ox = vx - wx * this.camera.scale;
    this.camera.oy = vy - wy * this.camera.scale;
    this.openConfig();
    this.scheduleUpdateWires();
  }

  realNodeSize(node: GFlowNode): number {
    return this.nodeSize * Math.max(node.entries?.length ?? 1, 1);
  }

  enterNode(node: GFlowNode): void {
    this.hoveredNodeId = node.id;
    this.nodeHoverFromCard = true;
    this.clearNodeHideTimer();
  }

  leaveNode(): void {
    this.nodeHoverFromCard = false;
    this.deferHideNodeToolbar();
  }

  enterNodeToolbar(): void {
    this.nodeHoverFromToolbar = true;
    this.clearNodeHideTimer();
  }

  leaveNodeToolbar(): void {
    this.nodeHoverFromToolbar = false;
    this.deferHideNodeToolbar();
  }

  private clearNodeHideTimer(): void {
    if (this.nodeHideTimer) {
      clearTimeout(this.nodeHideTimer);
      this.nodeHideTimer = null;
    }
  }

  private deferHideNodeToolbar(): void {
    this.clearNodeHideTimer();
    this.nodeHideTimer = setTimeout(() => {
      if (!this.nodeHoverFromCard && !this.nodeHoverFromToolbar) {
        this.hoveredNodeId = null;
      }
      this.nodeHideTimer = null;
    }, 150);
  }

  deleteNode(node: GFlowNode): void {
    this.state.removeNode(node.id);
    if (this.draggingNode?.id === node.id) {
      this.draggingNode = null;
    }
    if (this.hoveredNodeId === node.id) {
      this.hoveredNodeId = null;
    }
    if (this.focusedNode?.id === node.id) {
      this.focusNode(null);
    }
    this.scheduleUpdateWires();
  }

  private snapHalf(value: number): number {
    const grid = this.baseStep;
    return Math.round((value + grid) / grid) * grid - grid;
  }

  private scheduleUpdateWires(): void {
    if (this.rafId !== null) {
      return;
    }

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.ngZone.runOutsideAngular(() => {
        const preview = this.linkRouting.recalculate({
          links: this.state.links,
          pendingLink: this.pendingLink,
          portCenter: (ref) => this.portCenterWorld(ref),
          baseStep: this.baseStep,
        });

        this.ngZone.run(() => {
          this.pendingPreviewD = preview;
          this.cdr.markForCheck();
        });
      });
    });
  }

  ngAfterViewInit(): void {
    this.scheduleUpdateWires();
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    if (this.hideToolbarTimer) {
      clearTimeout(this.hideToolbarTimer);
    }
    if (this.nodeHideTimer) {
      clearTimeout(this.nodeHideTimer);
    }
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (this.camera.handleWheel(event, this.viewportRef.nativeElement)) {
      this.scheduleUpdateWires();
    }
  }

  onViewportMouseDown(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (this.draggingNode || this.pendingLink) {
      return;
    }
    this.camera.beginPan(event);
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.draggingNode && !this.pendingLink && this.camera.pan(event)) {
      this.scheduleUpdateWires();
      return;
    }
  }

  onDocMouseUp(event: MouseEvent): void {
    this.camera.endPan();
    this.finishLink(event);
    this.draggingNode = null;
    this.dragGroup = [];
  }

  onViewportClick(event: MouseEvent): void {
    if (this.camera.consumeClick()) {
      return;
    }
    this.deselectAll();
    event.stopPropagation();
  }

  startDrag(event: MouseEvent, node: GFlowNode): void {
    if ((event.target as HTMLElement)?.closest('.input-port, .output-port, .entry-port, .exit-port')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const world = this.camera.toWorld(event, this.viewportRef.nativeElement);
    this.draggingNode = node;
    this.dragDX = world.x - node.x;
    this.dragDY = world.y - node.y;
    this.dragMainStart = { x: node.x, y: node.y };

    this.dragGroup = [];
    if (node.entries && node.entries.length) {
      const childIds = new Set<string>();
      for (let entryIdx = 0; entryIdx < node.entries.length; entryIdx++) {
        for (const link of this.links) {
          if (
            link.relation === 'entry-exit' &&
            link.src.nodeId === node.id &&
            link.src.kind === 'entry' &&
            link.src.portIndex === entryIdx &&
            link.dst.kind === 'exit'
          ) {
            childIds.add(link.dst.nodeId);
          }
        }
      }

      childIds.forEach((id) => {
        const child = this.nodes.find((candidate) => candidate.id === id);
        if (child && child.id !== node.id) {
          this.dragGroup.push({ node: child, x0: child.x, y0: child.y });
        }
      });
    }
  }

  onDocMouseMove(event: MouseEvent): void {
    if (this.draggingNode) {
      const world = this.camera.toWorld(event, this.viewportRef.nativeElement);
      this.draggingNode.x = this.snapHalf(world.x - this.dragDX);
      this.draggingNode.y = this.snapHalf(world.y - this.dragDY);

      const dx = this.draggingNode.x - this.dragMainStart.x;
      const dy = this.draggingNode.y - this.dragMainStart.y;

      for (const group of this.dragGroup) {
        group.node.x = this.snapHalf(group.x0 + dx);
        group.node.y = this.snapHalf(group.y0 + dy);
      }

      this.scheduleUpdateWires();
    }

    if (this.pendingLink) {
      const world = this.camera.toWorld(event, this.viewportRef.nativeElement);
      this.pendingLink.mouse = world;
      this.scheduleUpdateWires();
    }
  }

  onDocMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const portEl = target?.closest('.input-port, .output-port, .entry-port, .exit-port') as HTMLElement | null;
    if (!portEl) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.camera.skipNextClickOnce();

    const host = portEl.closest('[data-node-id]') as HTMLElement;
    if (!host) {
      return;
    }

    const nodeId = host.getAttribute('data-node-id');
    if (!nodeId) {
      return;
    }

    const portIndex = Number(portEl.getAttribute('data-index') || 0);
    let kind: PortKind = 'in';
    if (portEl.classList.contains('output-port')) {
      kind = 'out';
    } else if (portEl.classList.contains('entry-port')) {
      kind = 'entry';
    } else if (portEl.classList.contains('exit-port')) {
      kind = 'exit';
    }

    const world = this.camera.toWorld(event, this.viewportRef.nativeElement);
    this.pendingLink = { from: { nodeId, portIndex, kind }, mouse: world };
    this.scheduleUpdateWires();
  }

  private finishLink(event: MouseEvent): void {
    if (!this.pendingLink) {
      return;
    }

    const target = event.target as HTMLElement;
    const portEl = target?.closest('.input-port, .output-port, .entry-port, .exit-port') as HTMLElement | null;

    if (portEl) {
      const host = portEl.closest('[data-node-id]') as HTMLElement | null;
      const nodeId = host?.getAttribute('data-node-id');
      if (nodeId) {
        const portIndex = Number(portEl.getAttribute('data-index') || 0);
        let kind: PortKind = 'in';
        if (portEl.classList.contains('output-port')) {
          kind = 'out';
        } else if (portEl.classList.contains('entry-port')) {
          kind = 'entry';
        } else if (portEl.classList.contains('exit-port')) {
          kind = 'exit';
        }

        const source = this.pendingLink.from;
        const targetRef: PortRef = { nodeId, portIndex, kind };

        const { src, dst, relation } = this.resolveLinkEndpoints(source, targetRef);
        if (src && dst && relation) {
          const samePort = src.nodeId === dst.nodeId && src.portIndex === dst.portIndex && src.kind === dst.kind;
          const entryExitBusy = relation === 'entry-exit' && (this.isPortBusy(src) || this.isPortBusy(dst));

          if (!samePort && !entryExitBusy) {
            const map = relation === 'io' && src.kind === 'out'
              ? this.state.effectiveOutputMap(src.nodeId, src.portIndex)
              : {};

            this.state.createLink({ src, dst, relation, map });

            if (relation === 'entry-exit') {
              const groupId = source.kind === 'entry' ? source.nodeId : targetRef.nodeId;
              this.state.recomputeDownstreamFrom(groupId);
              this.pushFocusedGraph();
            }
          }
        }
      }
    }

    this.pendingLink = null;
    this.pendingPreviewD = '';
    this.scheduleUpdateWires();
    this.pushFocusedGraph();
  }

  private resolveLinkEndpoints(a: PortRef, b: PortRef): {
    src: PortRef | null;
    dst: PortRef | null;
    relation: 'io' | 'entry-exit' | null;
  } {
    if (a.kind === 'out' && b.kind === 'in') {
      return { src: a, dst: b, relation: 'io' };
    }
    if (a.kind === 'in' && b.kind === 'out') {
      return { src: b, dst: a, relation: 'io' };
    }
    if (a.kind === 'entry' && b.kind === 'exit') {
      return { src: a, dst: b, relation: 'entry-exit' };
    }
    if (a.kind === 'exit' && b.kind === 'entry') {
      return { src: b, dst: a, relation: 'entry-exit' };
    }
    return { src: null, dst: null, relation: null };
  }

  private isPortBusy(ref: PortRef): boolean {
    return this.links.some(
      (link) =>
        link.relation === 'entry-exit' &&
        ((link.src.nodeId === ref.nodeId && link.src.kind === ref.kind && link.src.portIndex === ref.portIndex) ||
          (link.dst.nodeId === ref.nodeId && link.dst.kind === ref.kind && link.dst.portIndex === ref.portIndex)),
    );
  }

  private portCenterWorld(ref: PortRef): { x: number; y: number } {
    const className =
      ref.kind === 'out'
        ? 'output'
        : ref.kind === 'in'
        ? 'input'
        : ref.kind === 'entry'
        ? 'entry'
        : 'exit';

    const selector = `[data-node-id="${ref.nodeId}"] .${className}-port[data-index="${ref.portIndex}"]`;
    const element = this.viewportRef.nativeElement.querySelector(selector) as HTMLElement | null;
    if (!element) {
      return { x: 0, y: 0 };
    }

    const portRect = element.getBoundingClientRect();
    const viewportRect = this.viewportRef.nativeElement.getBoundingClientRect();
    const cx = portRect.left + portRect.width / 2 - viewportRect.left;
    const cy = portRect.top + portRect.height / 2 - viewportRect.top;

    return {
      x: (cx - this.camera.ox) / this.camera.scale,
      y: (cy - this.camera.oy) / this.camera.scale,
    };
  }

  onNodeConfigChange = (event: any): void => {
    if (!this.focusedNode) {
      return;
    }

    for (const groupId of this.state.parentAgentGroupsOf(this.focusedNode.id)) {
      this.state.recomputeDownstreamFrom(groupId);
    }

    this.state.recomputeDownstreamFrom(this.focusedNode.id);
    this.pushFocusedGraph();
    this.pushFocusedInputMap();
    this.scheduleUpdateWires();
    this.cdr.markForCheck();
  };

  removeLink(link: GFlowLink): void {
    const removed = this.state.removeLink(link.id);
    if (!removed) {
      return;
    }

    if (this.hoveredLinkId === link.id) {
      this.hoveredLinkId = null;
    }

    if (removed.relation === 'io') {
      this.state.recomputeDownstreamFrom(removed.dst.nodeId);
    } else if (removed.relation === 'entry-exit') {
      const groupId = removed.src.kind === 'entry' ? removed.src.nodeId : removed.dst.nodeId;
      this.state.recomputeDownstreamFrom(groupId);
    }

    this.pushFocusedGraph();
    this.scheduleUpdateWires();
  }

  splitLink(link: GFlowLink): void {
    if (!link.mid || link.relation !== 'io') {
      return;
    }

    const x0 = this.snapHalf(link.mid.x - this.nodeSize / 2);
    const y0 = this.snapHalf(link.mid.y - this.nodeSize / 2);
    const newNode = this.state.createNode('agent', x0, y0);

    this.state.removeLink(link.id);
    this.state.createLink({
      src: { ...link.src },
      dst: { nodeId: newNode.id, portIndex: 0, kind: 'in' },
      relation: 'io',
      map: this.state.cloneValue(link.map ?? {}),
    });

    this.state.createLink({
      src: { nodeId: newNode.id, portIndex: 0, kind: 'out' },
      dst: { ...link.dst },
      relation: 'io',
      map: this.state.effectiveOutputMap(newNode.id, 0),
    });

    this.hoveredLinkId = null;
    this.scheduleUpdateWires();
  }

  private loadConfigComponent(): void {
    if (!this.configHost) {
      return;
    }

    this.configHost.clear();
    this.configCmpRef?.destroy();
    this.configCmpRef = null;

    const node = this.focusedNode;
    if (!node?.configComponent) {
      return;
    }

    this.configCmpRef = this.configHost.createComponent(node.configComponent);
    this.configCmpRef.setInput('node', node);

    this.pushFocusedInputMap();
    this.pushFocusedGraph();

    const instance: any = this.configCmpRef.instance;
    if (instance?.configChange?.subscribe) {
      instance.configChange.subscribe((evt: any) => {
        if (!this.focusedNode) {
          return;
        }

        if (evt?.type === 'entry-removed') {
          this.removeGroupEntry(this.focusedNode, evt.index);
        }
        if (evt?.type === 'entries-changed') {
          this.state.recomputeDownstreamFrom(this.focusedNode.id);
          this.scheduleUpdateWires();
        }

        this.pushFocusedGraph();
        this.cdr.markForCheck();
      });
    }
  }

  private removeGroupEntry(group: GFlowNode, index: number): void {
    this.state.removeGroupEntry(group.id, index);
    this.state.recomputeDownstreamFrom(group.id);
    this.scheduleUpdateWires();
  }

  private pushFocusedInputMap(): void {
    if (!this.configCmpRef || !this.focusedNode) {
      return;
    }
    const inputMap = this.state.aggregateIncomingMap(this.focusedNode.id);
    this.configCmpRef.setInput?.('inputMap', this.state.cloneValue(inputMap));
  }

  private pushFocusedGraph(): void {
    if (!this.configCmpRef) {
      return;
    }
    this.configCmpRef.setInput('nodes', this.nodes);
    this.configCmpRef.setInput('links', this.links);
  }

  togglePalette(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.paletteOpen = !this.paletteOpen;
  }

  addFromPalette(item: PaletteItem): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const vx =
      this.paletteSide === 'left' && this.paletteOpen
        ? this.paletteWidth + 80
        : this.paletteSide === 'right' && this.paletteOpen
        ? rect.width - this.paletteWidth - 80
        : rect.width * 0.5;
    const vy = rect.height * 0.5;

    const wx = (vx - this.camera.ox) / this.camera.scale;
    const wy = (vy - this.camera.oy) / this.camera.scale;
    const x0 = this.snapHalf(wx - this.nodeSize / 2);
    const y0 = this.snapHalf(wy - this.nodeSize / 2);

    if (item.type === 'start' && this.state.hasStartNode()) {
      return;
    }

    const node = this.state.createNode(item.type, x0, y0);
    this.centerNode(node);
    this.scheduleUpdateWires();
  }

  onPaletteDragStart(event: DragEvent, item: PaletteItem): void {
    event.dataTransfer?.setData('application/x-node', JSON.stringify(item));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onWorldDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types?.includes('application/x-node')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onWorldDrop(event: DragEvent): void {
    const raw = event.dataTransfer?.getData('application/x-node');
    if (!raw) {
      return;
    }
    event.preventDefault();

    const item: PaletteItem = JSON.parse(raw);
    const world = this.camera.toWorld(event as any as MouseEvent, this.viewportRef.nativeElement);
    const x0 = this.snapHalf(world.x - this.nodeSize / 2);
    const y0 = this.snapHalf(world.y - this.nodeSize / 2);

    const node = this.state.createNode(item.type, x0, y0);
    this.focusNode(node);
    this.openConfig();
    this.scheduleUpdateWires();
  }

  openConfig(): void {
    this.configOpen = true;
    this.loadConfigComponent();
  }

  closeConfig(): void {
    this.configOpen = false;
    this.focusNode(null);
  }

  exitHidden(node: GFlowNode): boolean {
    return node.type === 'agent' && this.state.usesPortKind(node.id, 'exit');
  }

  ioHidden(node: GFlowNode): boolean {
    return (
      node.type === 'agent' &&
      (this.state.usesPortKind(node.id, 'out') || this.state.usesPortKind(node.id, 'in'))
    );
  }
}
