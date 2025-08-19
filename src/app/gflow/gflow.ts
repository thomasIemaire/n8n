import { CommonModule } from '@angular/common';
import {
  Component, ElementRef, ViewChild,
  NgZone, ChangeDetectorRef, AfterViewInit, OnDestroy
} from '@angular/core';
import { Node } from './node/node';
import { NodeFactory } from './core/node.factory';

export interface GFlowPort { name?: string; }
export interface GFlowNode {
  id: string;
  type: string;
  x: number;
  y: number;
  inputs: GFlowPort[];
  outputs: GFlowPort[];
}

export class GFlowNodeModel implements GFlowNode {
  id: string = '';
  type: string = '';
  x: number = 0;
  y: number = 0;
  inputs: GFlowPort[] = [];
  outputs: GFlowPort[] = [];

  constructor(init?: Partial<GFlowNode>) {
    if (init) {
      this.id = init.id || Date.now().toString();
      this.type = init.type || '';
      this.x = init.x ?? 0;
      this.y = init.y ?? 0;
      this.inputs = init.inputs || [];
      this.outputs = init.outputs || [];
    }
  }
}

export interface GFlowLink {
  id: string;
  src: { nodeId: string; portIndex: number; };
  dst: { nodeId: string; portIndex: number; };
  d?: string; // path mis en cache pour le template
  mid?: { x: number; y: number };
}

type PortKind = 'in' | 'out';
interface PortRef { nodeId: string; portIndex: number; kind: PortKind; }
interface PendingLink { from: PortRef; mouse: { x: number; y: number }; }

/* ---------- Palette ---------- */
interface PaletteItem {
  type: 'start' | 'end' | 'agent' | 'if';
  label: string;
  icon: string; // PrimeIcons class, ex: 'pi pi-play'
}
interface PaletteGroup { name: string; items: PaletteItem[]; }

@Component({
  selector: 'app-gflow', standalone: true,
  imports: [CommonModule, Node],
  templateUrl: './gflow.html',
  styleUrls: ['./gflow.scss']
})
export class Gflow implements AfterViewInit, OnDestroy {
  constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) {
    // exemple: un nœud de départ initial
    this.nodes.push(NodeFactory.createNode('start', 0, 0));
  }

  @ViewChild('viewport', { static: true }) viewport!: ElementRef<HTMLElement>;

  // ----- vue / grille
  public ox = 0; public oy = 0; public scale = 1;
  public readonly baseStep = 24;
  public readonly baseDot = 1;
  public get dotR() { return this.baseDot; }

  // ----- nœuds & liens
  public nodes: GFlowNode[] = [];
  public links: GFlowLink[] = [];
  private nextId = 1;
  private nextLinkId = 1;
  public get nodeSize(): number { return 4 * this.baseStep; }

  // aperçu du lien en cours
  public pendingLink: PendingLink | null = null;
  public pendingPreviewD = '';

  // ----- Toolbar lien (anti-clignotement)
  public hoveredLinkId: string | null = null;
  public get hoveredLink() { return this.links.find(l => l.id === this.hoveredLinkId) || null; }
  private hoverFromPath = false;
  private hoverFromToolbar = false;
  private hideToolbarTimer: any = null;
  enterLink(l: GFlowLink) {
    this.hoveredLinkId = l.id;
    this.hoverFromPath = true;
    if (this.hideToolbarTimer) { clearTimeout(this.hideToolbarTimer); this.hideToolbarTimer = null; }
  }
  leaveLink() {
    this.hoverFromPath = false;
    this.maybeHideToolbar();
  }
  enterToolbar() {
    this.hoverFromToolbar = true;
    if (this.hideToolbarTimer) { clearTimeout(this.hideToolbarTimer); this.hideToolbarTimer = null; }
  }
  leaveToolbar() {
    this.hoverFromToolbar = false;
    this.maybeHideToolbar();
  }
  private maybeHideToolbar() {
    if (this.hideToolbarTimer) clearTimeout(this.hideToolbarTimer);
    this.hideToolbarTimer = setTimeout(() => {
      if (!this.hoverFromPath && !this.hoverFromToolbar) {
        this.hoveredLinkId = null;
        this.cdr.markForCheck?.();
      }
      this.hideToolbarTimer = null;
    }, 150);
  }

  // ----- Toolbar nœud (anti-clignotement)
  public hoveredNodeId: string | null = null;
  public get hoveredNode() { return this.nodes.find(n => n.id === this.hoveredNodeId) || null; }
  private nodeHoverFromCard = false;
  private nodeHoverFromToolbar = false;
  private nodeHideTimer: any = null;
  enterNode(n: GFlowNode) {
    this.hoveredNodeId = n.id;
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
    if (this.nodeHideTimer) { clearTimeout(this.nodeHideTimer); this.nodeHideTimer = null; }
  }
  private deferHideNodeToolbar() {
    this.clearNodeHideTimer();
    this.nodeHideTimer = setTimeout(() => {
      if (!this.nodeHoverFromCard && !this.nodeHoverFromToolbar) {
        this.hoveredNodeId = null;
      }
      this.nodeHideTimer = null;
    }, 150);
  }
  deleteNode(n: GFlowNode) {
    this.links = this.links.filter(l => l.src.nodeId !== n.id && l.dst.nodeId !== n.id);
    this.nodes = this.nodes.filter(nn => nn.id !== n.id);
    if (this.draggingNode?.id === n.id) this.draggingNode = null;
    if (this.hoveredNodeId === n.id) this.hoveredNodeId = null;
    this.scheduleUpdateWires();
  }

  // ----- util
  private vpToWorld(ev: MouseEvent) {
    const rect = this.viewport.nativeElement.getBoundingClientRect();
    const vx = ev.clientX - rect.left;
    const vy = ev.clientY - rect.top;
    return { x: (vx - this.ox) / this.scale, y: (vy - this.oy) / this.scale };
  }
  private snapHalf(v: number): number {
    const g = this.baseStep;
    return Math.round((v + g) / g) * g - g;
  }

  // ====== RAF scheduling pour recalculer les paths ======
  private rafId: number | null = null;
  private scheduleUpdateWires() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.ngZone.runOutsideAngular(() => this.recalcLinkPaths());
      this.ngZone.run(() => this.cdr.markForCheck());
    });
  }
  private recalcLinkPaths() {
    for (const l of this.links) {
      const p1 = this.portCenterWorld({ nodeId: l.src.nodeId, portIndex: l.src.portIndex, kind: 'out' });
      const p2 = this.portCenterWorld({ nodeId: l.dst.nodeId, portIndex: l.dst.portIndex, kind: 'in' });

      const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);
      const c1 = { x: p1.x + dx, y: p1.y };
      const c2 = { x: p2.x - dx, y: p2.y };

      l.d = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;

      const t = 0.5, u = 1 - t;
      const midX = u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x;
      const midY = u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y;
      l.mid = { x: midX, y: midY };
    }

    if (this.pendingLink) {
      const p1 = this.portCenterWorld(this.pendingLink.from);
      const p2 = this.pendingLink.mouse;
      this.pendingPreviewD = this.cubic(p1.x, p1.y, p2.x, p2.y);
    } else {
      this.pendingPreviewD = '';
    }
  }
  ngAfterViewInit() { this.scheduleUpdateWires(); }
  ngOnDestroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.hideToolbarTimer) clearTimeout(this.hideToolbarTimer);
    if (this.nodeHideTimer) clearTimeout(this.nodeHideTimer);
  }

  // ----- caméra
  public onWheel(ev: WheelEvent) {
    ev.preventDefault();
    const factor = Math.exp(-ev.deltaY * 0.001);
    const prev = this.scale;
    this.scale = Math.min(2, Math.max(0.25, this.scale * factor));
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top;
    this.ox = cx - (cx - this.ox) * (this.scale / prev);
    this.oy = cy - (cy - this.oy) * (this.scale / prev);
    this.scheduleUpdateWires();
  }
  public onMouseMove(ev: MouseEvent) {
    if (this.draggingNode || this.pendingLink) return;
    if (ev.buttons & 1) {
      this.ox += ev.movementX;
      this.oy += ev.movementY;
      this.scheduleUpdateWires();
    }
  }

  // ----- ajout nœud (dblclick -> 'if' pour l’exemple)
  public onDblClick(ev: MouseEvent) {
    const w = this.vpToWorld(ev);
    const x0 = this.snapHalf(w.x - this.nodeSize / 2);
    const y0 = this.snapHalf(w.y - this.nodeSize / 2);
    this.nodes.push(NodeFactory.createNode('if', x0, y0));
    this.scheduleUpdateWires();
  }

  // ----- drag & drop nœud
  public draggingNode: GFlowNode | null = null;
  private dragDX = 0; private dragDY = 0;
  public startDrag(ev: MouseEvent, n: GFlowNode) {
    if ((ev.target as HTMLElement)?.closest('.input-port, .output-port')) return;
    ev.preventDefault(); ev.stopPropagation();
    const w = this.vpToWorld(ev);
    this.draggingNode = n;
    this.dragDX = w.x - n.x; this.dragDY = w.y - n.y;
  }
  public onDocMouseMove(ev: MouseEvent) {
    if (this.draggingNode) {
      const w = this.vpToWorld(ev);
      this.draggingNode.x = this.snapHalf(w.x - this.dragDX);
      this.draggingNode.y = this.snapHalf(w.y - this.dragDY);
      this.scheduleUpdateWires();
    }
    if (this.pendingLink) {
      const w = this.vpToWorld(ev);
      this.pendingLink.mouse = w;
      this.scheduleUpdateWires();
    }
  }
  public onDocMouseUp(_ev: MouseEvent) {
    this.finishLink(_ev);
    this.draggingNode = null;
  }

  // ================== LIENS ==================
  public onDocMouseDown(ev: MouseEvent) {
    const target = ev.target as HTMLElement;
    const portEl = target?.closest('.input-port, .output-port') as HTMLElement | null;
    if (!portEl) return;

    ev.preventDefault(); ev.stopPropagation();

    const host = portEl.closest('[data-node-id]') as HTMLElement;
    const nodeId = host.getAttribute('data-node-id')!;
    const portIndex = Number(portEl.getAttribute('data-index') || 0);
    const kind: PortKind = portEl.classList.contains('output-port') ? 'out' : 'in';

    const w = this.vpToWorld(ev);
    this.pendingLink = { from: { nodeId, portIndex, kind }, mouse: w };
    this.scheduleUpdateWires();
  }
  private finishLink(ev: MouseEvent) {
    if (!this.pendingLink) return;

    const target = ev.target as HTMLElement;
    const portEl = target?.closest('.input-port, .output-port') as HTMLElement | null;

    if (portEl) {
      const host = portEl.closest('[data-node-id]') as HTMLElement;
      const nodeId = host.getAttribute('data-node-id')!;
      const portIndex = Number(portEl.getAttribute('data-index') || 0);
      const kind: PortKind = portEl.classList.contains('output-port') ? 'out' : 'in';

      const a = this.pendingLink.from;
      const b: PortRef = { nodeId, portIndex, kind };

      let src: PortRef | null = null, dst: PortRef | null = null;
      if (a.kind === 'out' && b.kind === 'in') { src = a; dst = b; }
      else if (a.kind === 'in' && b.kind === 'out') { src = b; dst = a; }

      if (src && dst && !(src.nodeId === dst.nodeId && src.portIndex === dst.portIndex)) {
        this.links.push({
          id: String(this.nextLinkId++),
          src: { nodeId: src.nodeId, portIndex: src.portIndex },
          dst: { nodeId: dst.nodeId, portIndex: dst.portIndex }
        });
      }
    }
    this.pendingLink = null;
    this.pendingPreviewD = '';
    this.scheduleUpdateWires();
  }
  private portCenterWorld(ref: PortRef) {
    const sel = `[data-node-id="${ref.nodeId}"] .${ref.kind === 'out' ? 'output' : 'input'}-port[data-index="${ref.portIndex}"]`;
    const el = this.viewport.nativeElement.querySelector(sel) as HTMLElement | null;
    if (!el) return { x: 0, y: 0 };

    const pr = el.getBoundingClientRect();
    const vp = this.viewport.nativeElement.getBoundingClientRect();
    const cx = pr.left + pr.width / 2 - vp.left;
    const cy = pr.top + pr.height / 2 - vp.top;
    return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale };
  }
  private cubic(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    const c1x = x1 + dx, c1y = y1;
    const c2x = x2 - dx, c2y = y2;
    return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  }
  removeLink(link: GFlowLink) {
    this.links = this.links.filter(l => l.id !== link.id);
    if (this.hoveredLinkId === link.id) this.hoveredLinkId = null;
    this.scheduleUpdateWires();
  }
  splitLink(link: GFlowLink) {
    if (!link.mid) return;
    const x0 = this.snapHalf(link.mid.x - this.nodeSize / 2);
    const y0 = this.snapHalf(link.mid.y - this.nodeSize / 2);

    const newNode = NodeFactory.createNode('agent', x0, y0);
    this.nodes.push(newNode);

    this.links = this.links.filter(l => l.id !== link.id);
    this.links.push(
      { id: String(this.nextLinkId++), src: { nodeId: link.src.nodeId, portIndex: link.src.portIndex }, dst: { nodeId: newNode.id, portIndex: 0 } },
      { id: String(this.nextLinkId++), src: { nodeId: newNode.id, portIndex: 0 }, dst: { nodeId: link.dst.nodeId, portIndex: link.dst.portIndex } }
    );

    this.hoveredLinkId = null;
    this.scheduleUpdateWires();
  }

  /* ==================== PALETTE (bouton +) ==================== */
  public paletteOpen = false;
  public paletteSide: 'left' | 'right' = 'left';
  private readonly paletteWidth = 280; // doit matcher --w en CSS

  public paletteGroups: PaletteGroup[] = [
    {
      name: 'Flux',
      items: [
        { type: 'start', label: 'Start', icon: 'pi pi-play' },
        { type: 'end', label: 'End', icon: 'pi pi-flag' }
      ]
    },
    {
      name: 'Logique',
      items: [
        { type: 'if', label: 'If', icon: 'pi pi-directions' }
      ]
    },
    {
      name: 'Agents',
      items: [
        { type: 'agent', label: 'Agent', icon: 'pi pi-user' }
      ]
    }
  ];

  togglePalette(ev?: MouseEvent) {
    if (ev) ev.stopPropagation();
    this.paletteOpen = !this.paletteOpen;
  }

  addFromPalette(it: PaletteItem) {
    const rect = this.viewport.nativeElement.getBoundingClientRect();
    const vx = this.paletteSide === 'left' && this.paletteOpen
      ? this.paletteWidth + 80
      : (this.paletteSide === 'right' && this.paletteOpen
        ? rect.width - this.paletteWidth - 80
        : rect.width * 0.5);
    const vy = rect.height * 0.5;

    const wx = (vx - this.ox) / this.scale;
    const wy = (vy - this.oy) / this.scale;
    const x0 = this.snapHalf(wx - this.nodeSize / 2);
    const y0 = this.snapHalf(wy - this.nodeSize / 2);

    this.nodes.push(NodeFactory.createNode(it.type, x0, y0));
    this.scheduleUpdateWires();
  }

  onPaletteDragStart(ev: DragEvent, it: PaletteItem) {
    ev.dataTransfer?.setData('application/x-node', JSON.stringify(it));
    ev.dataTransfer!.effectAllowed = 'copy';
  }
  onWorldDragOver(ev: DragEvent) {
    if (ev.dataTransfer?.types?.includes('application/x-node')) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
    }
  }
  onWorldDrop(ev: DragEvent) {
    const raw = ev.dataTransfer?.getData('application/x-node');
    if (!raw) return;
    ev.preventDefault();
    const it: PaletteItem = JSON.parse(raw);
    const w = this.vpToWorld(ev as any as MouseEvent);
    const x0 = this.snapHalf(w.x - this.nodeSize / 2);
    const y0 = this.snapHalf(w.y - this.nodeSize / 2);
    this.nodes.push(NodeFactory.createNode(it.type, x0, y0));
    this.scheduleUpdateWires();
  }
}
