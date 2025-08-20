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
  name: string;
  type: string;
  x: number;
  y: number;
  inputs: GFlowPort[];
  outputs: GFlowPort[];
  configured?: boolean;
}

export class GFlowNodeModel implements GFlowNode {
  id: string = '';
  name: string = '';
  type: string = '';
  x: number = 0;
  y: number = 0;
  inputs: GFlowPort[] = [];
  outputs: GFlowPort[] = [];
  configured?: boolean;

  constructor(init?: Partial<GFlowNode>) {
    if (init) {
      this.id = init.id || Date.now().toString();
      this.name = init.name || '';
      this.type = init.type || '';
      this.x = init.x ?? 0;
      this.y = init.y ?? 0;
      this.inputs = init.inputs || [];
      this.outputs = init.outputs || [];
      this.configured = init.configured ?? undefined;
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
type NodeType =
  | 'start'
  | 'end-success' | 'end-error'
  | 'if' | 'merge' | 'edit'
  | 'sardine'
  | 'agent' | 'agent-group';

interface PaletteItem {
  type: NodeType;
  label: string;
  icon: string; // PrimeIcons class
}
interface PaletteGroup { name: string; items: PaletteItem[]; }

@Component({
  selector: 'app-gflow', standalone: true,
  imports: [CommonModule, Node],
  templateUrl: './gflow.html',
  styleUrls: ['./gflow.scss']
})
export class Gflow implements AfterViewInit, OnDestroy {
  constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) { }

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
  private hasStart(): boolean { return this.nodes.some(n => n.type === 'start'); }

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
    const radius = this.baseStep * 0.75; // coins arrondis manhattan
    const stub = this.baseStep * 2;    // petit “décollage” depuis les ports
    const aheadThreshold = this.baseStep * 2; // marge pour dire “devant”

    for (const l of this.links) {
      const srcRef: PortRef = { nodeId: l.src.nodeId, portIndex: l.src.portIndex, kind: 'out' };
      const dstRef: PortRef = { nodeId: l.dst.nodeId, portIndex: l.dst.portIndex, kind: 'in' };
      const p1 = this.portCenterWorld(srcRef);
      const p2 = this.portCenterWorld(dstRef);

      const ahead = p2.x >= p1.x + aheadThreshold;
      if (ahead) {
        const route = this.routeSoft(p1, p2, 'E', 'W', stub);
        l.d = route.d; l.mid = route.mid;
      } else {
        const route = this.routeManhattan(p1, p2, 'E', 'W', stub, radius);
        l.d = route.d; l.mid = route.mid;
      }
    }

    if (this.pendingLink) {
      const p1 = this.portCenterWorld(this.pendingLink.from);
      const p2 = this.pendingLink.mouse;

      // sens de sortie/entrée selon le port d’origine
      const dirA: 'E' | 'W' = this.pendingLink.from.kind === 'out' ? 'E' : 'W';
      const dirB: 'E' | 'W' = this.pendingLink.from.kind === 'out' ? 'W' : 'E';

      const ahead = dirA === 'E'
        ? (p2.x >= p1.x + aheadThreshold)
        : (p1.x >= p2.x + aheadThreshold);

      const route = ahead
        ? this.routeSoft(p1, p2, dirA, dirB, stub)
        : this.routeManhattan(p1, p2, dirA, dirB, stub, radius);

      this.pendingPreviewD = route.d;
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
  /** Lien “souple” : cubic entre deux stubs + traits jusqu’aux ports. */
  private routeSoft(
    a: { x: number, y: number },
    b: { x: number, y: number },
    dirA: 'E' | 'W' | 'N' | 'S',
    dirB: 'E' | 'W' | 'N' | 'S',
    stub: number
  ): { d: string, mid: { x: number, y: number } } {

    const pA = this.offset(a, dirA, stub); // sortie du port A
    const pB = this.offset(b, dirB, stub); // entrée côté B

    // contrôles horizontaux principalement (style lacet)
    const dx = Math.max(40, Math.abs(pB.x - pA.x) * 0.5);
    const c1 = { x: pA.x + (dirA === 'E' ? dx : -dx), y: pA.y };
    const c2 = { x: pB.x + (dirB === 'W' ? -dx : dx), y: pB.y };

    const d = [
      `M ${a.x} ${a.y}`,
      `L ${pA.x} ${pA.y}`,
      `C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${pB.x} ${pB.y}`,
      `L ${b.x} ${b.y}`
    ].join(' ');

    // milieu approximatif = milieu de la courbe
    const t = 0.5, u = 1 - t;
    const midX =
      u * u * u * pA.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * pB.x;
    const midY =
      u * u * u * pA.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * pB.y;

    return { d, mid: { x: midX, y: midY } };
  }
  /** Route Manhattan H/V avec coins arrondis. */
  private routeManhattan(
    a: { x: number, y: number },
    b: { x: number, y: number },
    dirA: 'E' | 'W' | 'N' | 'S',
    dirB: 'E' | 'W' | 'N' | 'S',
    stub: number,
    radius: number
  ): { d: string, mid: { x: number, y: number } } {

    const pa = this.offset(a, dirA, stub);
    const pb = this.offset(b, dirB, stub);

    const pts: Array<{ x: number, y: number }> = [a, pa];

    if (pb.x - pa.x >= stub) {
      const mx = (pa.x + pb.x) / 2;
      pts.push({ x: mx, y: pa.y }, { x: mx, y: pb.y });
    } else {
      const vgap = stub * 2.5 * (pb.y >= pa.y ? 1 : -1);
      pts.push({ x: pa.x, y: pa.y + vgap }, { x: pb.x, y: pa.y + vgap });
    }

    pts.push(pb, b);

    const d = this.roundedPath(pts, radius);
    const mid = this.polylineMidpoint(pts);
    return { d, mid };
  }

  private offset(p: { x: number, y: number }, dir: 'E' | 'W' | 'N' | 'S', d: number) {
    switch (dir) {
      case 'E': return { x: p.x + d, y: p.y };
      case 'W': return { x: p.x - d, y: p.y };
      case 'N': return { x: p.x, y: p.y - d };
      case 'S': return { x: p.x, y: p.y + d };
    }
  }

  private roundedPath(pts: Array<{ x: number, y: number }>, r: number): string {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      if (!p2) { d += ` L ${p1.x} ${p1.y}`; break; }
      const v1 = { x: p0.x - p1.x, y: p0.y - p1.y };
      const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
      const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
      if (!l1 || !l2) continue;
      const rr = Math.min(r, l1 / 2, l2 / 2);
      const pA = { x: p1.x + (v1.x / l1) * rr, y: p1.y + (v1.y / l1) * rr };
      const pB = { x: p1.x + (v2.x / l2) * rr, y: p1.y + (v2.y / l2) * rr };
      d += ` L ${pA.x} ${pA.y} Q ${p1.x} ${p1.y} ${pB.x} ${pB.y}`;
    }
    return d;
  }

  private polylineMidpoint(pts: Array<{ x: number, y: number }>): { x: number, y: number } {
    let L = 0; const seg: number[] = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(l); L += l; }
    let t = L / 2;
    for (let i = 1; i < pts.length; i++) {
      if (t <= seg[i - 1]) {
        const k = t / seg[i - 1], p0 = pts[i - 1], p1 = pts[i];
        return { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k };
      }
      t -= seg[i - 1];
    }
    return pts[Math.floor(pts.length / 2)] || pts[0];
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
        { type: 'end-success', label: 'Fin – Réussite', icon: 'pi pi-check-circle' },
        { type: 'end-error', label: 'Fin – Erreur', icon: 'pi pi-times-circle' },
      ]
    },
    {
      name: 'Logique',
      items: [
        { type: 'if', label: 'If', icon: 'pi pi-arrow-right-arrow-left' },
        { type: 'merge', label: 'Merge', icon: 'pi pi-sitemap' },
        { type: 'edit', label: 'Edit', icon: 'pi pi-pencil' },
      ]
    },
    {
      name: 'Agents',
      items: [
        { type: 'sardine', label: 'Sardine', icon: 'pi pi-send' },
        { type: 'agent', label: 'Agent', icon: 'pi pi-microchip-ai' },
        { type: 'agent-group', label: 'Agent groupé', icon: 'pi pi-users' },
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

    if (it.type === 'start' && this.hasStart()) return;
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
