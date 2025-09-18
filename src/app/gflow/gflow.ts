import { CommonModule } from '@angular/common';
import {
  Component, ElementRef, ViewChild,
  NgZone, ChangeDetectorRef, AfterViewInit, OnDestroy,
  Type,
  ViewContainerRef,
  ComponentRef
} from '@angular/core';
import { Node } from './node/node';
import { NodeFactory } from './core/node.factory';
import { TabsModule } from 'primeng/tabs';

export interface GFlowPort { name?: string; map?: JSON; }
export interface GFlowConfig { }
export interface GFlowNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  inputs: GFlowPort[];
  outputs: GFlowPort[];
  entries?: GFlowPort[];
  exits?: GFlowPort[];
  configured?: boolean;
  focused?: boolean;
  config?: GFlowConfig;
  configComponent?: Type<any>;
}

export class GFlowNodeModel implements GFlowNode {
  id: string = '';
  name: string = '';
  type: string = '';
  x: number = 0;
  y: number = 0;
  inputs: GFlowPort[] = [];
  outputs: GFlowPort[] = [];
  entries: GFlowPort[] = [];
  exits: GFlowPort[] = [];
  configured?: boolean;
  focused?: boolean;
  config?: GFlowConfig;
  configComponent?: any;

  constructor(init?: Partial<GFlowNode>) {
    if (init) {
      this.id = init.id || Date.now().toString();
      this.name = init.name || '';
      this.type = init.type || '';
      this.x = init.x ?? 0;
      this.y = init.y ?? 0;
      this.inputs = init.inputs || [];
      this.outputs = init.outputs || [];
      this.entries = init.entries || [];
      this.exits = init.exits || [];
      this.configured = init.configured ?? undefined;
      this.focused = init.focused ?? false;
      this.config = init.config || {};
      this.configComponent = init.configComponent || null;
    }
  }
}

export type JSONValue = string | number | boolean | null | JSONValue[] | { [k: string]: JSONValue };
export type JSON = JSONValue;

export interface GFlowLink {
  id: string;
  src: PortRef;
  dst: PortRef;
  relation: 'io' | 'entry-exit';  // <— nouveau
  d?: string;
  mid?: { x: number; y: number };
  map?: JSON;
}

type PortKind = 'in' | 'out' | 'entry' | 'exit';
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
  imports: [CommonModule, Node, TabsModule],
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

  /** NOM lisible pour un node */
  nodeName(id: string) {
    return this.nodes.find(n => n.id === id)?.name || id;
  }

  /** Tous les liens entrants (relation io) vers l'input #idx du focusedNode */
  inputLinksFor(idx: number): GFlowLink[] {
    if (!this.focusedNode) return [];
    return this.links.filter(l =>
      l.relation === 'io' &&
      l.dst.nodeId === this.focusedNode!.id &&
      l.dst.kind === 'in' &&
      l.dst.portIndex === idx
    );
  }

  /** Tous les liens sortants (relation io) depuis l'output #idx du focusedNode */
  outputLinksFor(idx: number): GFlowLink[] {
    if (!this.focusedNode) return [];
    return this.links.filter(l =>
      l.relation === 'io' &&
      l.src.nodeId === this.focusedNode!.id &&
      l.src.kind === 'out' &&
      l.src.portIndex === idx
    );
  }

  /** trackBy pour *ngFor sur les liens */
  trackByLinkId(_i: number, l: GFlowLink) { return l.id; }

  // aperçu du lien en cours
  public pendingLink: PendingLink | null = null;
  public pendingPreviewD = '';

  // ===== Drag group (entries => children suivent) =====
  private dragMainStart = { x: 0, y: 0 };
  private dragGroup: Array<{ node: GFlowNode; x0: number; y0: number }> = [];

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

  public focusedNode: GFlowNode | null = null;
  focusNode(n: GFlowNode | null) {
    this.focusedNode = n;
    this.nodes.forEach(nn => nn.focused = (nn.id === n?.id));
    this.cdr.markForCheck();
    this.loadConfigComponent();
  }

  deselectAll() { this.closeConfig(); }

  centerNode(n: GFlowNode) {
    this.focusNode(n);
    const rect = this.viewport.nativeElement.getBoundingClientRect();
    const vx = rect.width / 2;
    const vy = rect.height / 2;
    const wx = n.x + this.realNodeSize(n) / 2;
    const wy = n.y + this.realNodeSize(n) / 2;
    this.ox = vx - wx * this.scale;
    this.oy = vy - wy * this.scale;
    this.openConfig();
    this.scheduleUpdateWires();
  }

  realNodeSize(n: GFlowNode) {
    return this.nodeSize * Math.max(n.entries!.length, 1);
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
    const radius = this.baseStep * 0.75;
    const stub = this.baseStep;
    const aheadThreshold = this.baseStep * 4;

    for (const l of this.links) {
      const p1 = this.portCenterWorld(l.src);
      const p2 = this.portCenterWorld(l.dst);

      if (l.relation === 'entry-exit') {
        // Trajet “souple” vertical (S→N)
        const route = this.routeManhattan(p1, p2, 'S', 'N', stub, radius);
        l.d = route.d; l.mid = route.mid;
      } else {
        // cas io (out→in) inchangé
        const ahead = p2.x >= p1.x + aheadThreshold;
        if (ahead) {
          const route = this.routeSoft(p1, p2, 'E', 'W', stub);
          l.d = route.d; l.mid = route.mid;
        } else {
          const route = this.routeManhattan(p1, p2, 'E', 'W', stub, radius);
          l.d = route.d; l.mid = route.mid;
        }
      }
    }

    // aperçu pendant le drag
    if (this.pendingLink) {
      const p1 = this.portCenterWorld(this.pendingLink.from);
      const p2 = this.pendingLink.mouse;

      if (this.pendingLink.from.kind === 'entry' || this.pendingLink.from.kind === 'exit') {
        const route = this.routeSoft(
          p1, p2,
          this.pendingLink.from.kind === 'entry' ? 'S' : 'N',
          this.pendingLink.from.kind === 'entry' ? 'N' : 'S',
          stub
        );
        this.pendingPreviewD = route.d;
      } else {
        const dirA: 'E' | 'W' = this.pendingLink.from.kind === 'out' ? 'E' : 'W';
        const dirB: 'E' | 'W' = this.pendingLink.from.kind === 'out' ? 'W' : 'E';
        const ahead = dirA === 'E' ? (p2.x >= p1.x + aheadThreshold) : (p1.x >= p2.x + aheadThreshold);
        const route = ahead ? this.routeSoft(p1, p2, dirA, dirB, stub)
          : this.routeManhattan(p1, p2, dirA, dirB, stub, radius);
        this.pendingPreviewD = route.d;
      }
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

  // --- pan detection
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private panMoved = false;
  private skipNextClick = false;

  onViewportMouseDown(ev: MouseEvent) {
    // bouton gauche, pas de drag node/lien en cours
    if (ev.button !== 0) return;
    if (this.draggingNode || this.pendingLink) return;

    this.isPanning = true;
    this.panMoved = false;
    this.panStart = { x: ev.clientX, y: ev.clientY };
  }

  public onMouseMove(ev: MouseEvent) {
    // si on est en train de panner
    if (this.isPanning && (ev.buttons & 1) && !this.draggingNode && !this.pendingLink) {
      // petit seuil pour distinguer click vs pan
      if (!this.panMoved) {
        const dx0 = Math.abs(ev.clientX - this.panStart.x);
        const dy0 = Math.abs(ev.clientY - this.panStart.y);
        if (dx0 + dy0 > 3) this.panMoved = true; // seuil 3px
      }
      this.ox += ev.movementX;
      this.oy += ev.movementY;
      this.scheduleUpdateWires();
      return;
    }

    // (ton ancien code de pan au bouton gauche n'est plus nécessaire ici)
    // s'il te faut garder la compatibilité :
    // if (!this.draggingNode && !this.pendingLink && (ev.buttons & 1)) { ... }
  }

  public onDocMouseUp(_ev: MouseEvent) {
    // fin du pan -> ignorer le prochain click si on a vraiment bougé
    if (this.isPanning) {
      if (this.panMoved) this.skipNextClick = true;
      this.isPanning = false;
      this.panMoved = false;
    }
    this.finishLink(_ev);
    this.draggingNode = null;
  }

  onViewportClick(ev: MouseEvent) {
    // si on vient de panner, on consomme le click
    if (this.skipNextClick) {
      this.skipNextClick = false;
      return;
    }
    this.deselectAll(); // ton comportement initial
  }

  // ----- drag & drop nœud
  public draggingNode: GFlowNode | null = null;
  private dragDX = 0; private dragDY = 0;
  public startDrag(ev: MouseEvent, n: GFlowNode) {
    // ne pas démarrer un drag si on clique un port
    if ((ev.target as HTMLElement)?.closest('.input-port, .output-port, .entry-port, .exit-port')) return;

    ev.preventDefault(); ev.stopPropagation();
    const w = this.vpToWorld(ev);

    this.draggingNode = n;
    this.dragDX = w.x - n.x;
    this.dragDY = w.y - n.y;

    // mémoriser la position de départ du node principal
    this.dragMainStart = { x: n.x, y: n.y };

    // construire le groupe: si le node a des entries, on ajoute tous les nœuds reliés aux entries (entry→exit)
    this.dragGroup = [];
    if (n.entries && n.entries.length) {
      const childIds = new Set<string>();

      for (let entryIdx = 0; entryIdx < n.entries.length; entryIdx++) {
        this.links.forEach(l => {
          if (
            l.relation === 'entry-exit' &&
            l.src.nodeId === n.id && l.src.kind === 'entry' &&
            l.src.portIndex === entryIdx &&
            l.dst.kind === 'exit'
          ) {
            childIds.add(l.dst.nodeId);
          }
        });
      }

      childIds.forEach(id => {
        const child = this.nodes.find(nn => nn.id === id);
        if (child && child.id !== n.id) {
          this.dragGroup.push({ node: child, x0: child.x, y0: child.y });
        }
      });
    }
  }
  public onDocMouseMove(ev: MouseEvent) {
    if (this.draggingNode) {
      const w = this.vpToWorld(ev);

      // position du node principal
      this.draggingNode.x = this.snapHalf(w.x - this.dragDX);
      this.draggingNode.y = this.snapHalf(w.y - this.dragDY);

      // delta par rapport à son point de départ
      const dx = this.draggingNode.x - this.dragMainStart.x;
      const dy = this.draggingNode.y - this.dragMainStart.y;

      // appliquer le delta aux enfants du groupe
      for (const g of this.dragGroup) {
        g.node.x = this.snapHalf(g.x0 + dx);
        g.node.y = this.snapHalf(g.y0 + dy);
      }

      this.scheduleUpdateWires();
    }

    if (this.pendingLink) {
      const w = this.vpToWorld(ev);
      this.pendingLink.mouse = w;
      this.scheduleUpdateWires();
    }
  }

  onNodeConfigChange = (_evt: any) => {
    if (!this.focusedNode) return;

    // si c’est un agent: ses parents groupés doivent ré-agréger
    for (const pg of this.parentAgentGroupsOf(this.focusedNode.id)) {
      this.recomputeDownstreamFrom(pg);
    }

    // puis recalcul “classique” depuis le node lui-même (utile pour les autres types)
    this.recomputeDownstreamFrom(this.focusedNode.id);

    // rafraîchir UI du panneau courant
    this.pushFocusedGraph();
    this.pushFocusedInputMap();
    this.scheduleUpdateWires();
    this.cdr.markForCheck();
  };

  private parentAgentGroupsOf(childId: string): string[] {
    const ids = new Set<string>();
    this.links.forEach(l => {
      if (l.relation === 'entry-exit' && l.dst.nodeId === childId && l.dst.kind === 'exit') {
        ids.add(l.src.nodeId); // le groupé
      }
    });
    return [...ids];
  }

  // ================== LIENS ==================
  public onDocMouseDown(ev: MouseEvent) {
    const target = ev.target as HTMLElement;
    const portEl = target?.closest('.input-port, .output-port, .entry-port, .exit-port') as HTMLElement | null;
    if (!portEl) return;

    ev.preventDefault(); ev.stopPropagation();

    this.skipNextClick = true;

    const host = portEl.closest('[data-node-id]') as HTMLElement;
    const nodeId = host.getAttribute('data-node-id')!;
    const portIndex = Number(portEl.getAttribute('data-index') || 0);

    let kind: PortKind = 'in';
    if (portEl.classList.contains('output-port')) kind = 'out';
    else if (portEl.classList.contains('input-port')) kind = 'in';
    else if (portEl.classList.contains('entry-port')) kind = 'entry';
    else if (portEl.classList.contains('exit-port')) kind = 'exit';

    const w = this.vpToWorld(ev);
    this.pendingLink = { from: { nodeId, portIndex, kind }, mouse: w };
    this.scheduleUpdateWires();
  }
  private finishLink(ev: MouseEvent) {
    if (!this.pendingLink) return;
    const target = ev.target as HTMLElement;
    const portEl = target?.closest('.input-port, .output-port, .entry-port, .exit-port') as HTMLElement | null;

    if (portEl) {
      const host = portEl.closest('[data-node-id]') as HTMLElement;
      const nodeId = host.getAttribute('data-node-id')!;
      const portIndex = Number(portEl.getAttribute('data-index') || 0);

      let kind: PortKind = 'in';
      if (portEl.classList.contains('output-port')) kind = 'out';
      else if (portEl.classList.contains('input-port')) kind = 'in';
      else if (portEl.classList.contains('entry-port')) kind = 'entry';
      else if (portEl.classList.contains('exit-port')) kind = 'exit';

      const a = this.pendingLink.from;
      const b: PortRef = { nodeId, portIndex, kind };

      let src: PortRef | null = null, dst: PortRef | null = null, relation: 'io' | 'entry-exit' | null = null;

      if (a.kind === 'out' && b.kind === 'in') { src = a; dst = b; relation = 'io'; }
      else if (a.kind === 'in' && b.kind === 'out') { src = b; dst = a; relation = 'io'; }
      else if (a.kind === 'entry' && b.kind === 'exit') { src = a; dst = b; relation = 'entry-exit'; }
      else if (a.kind === 'exit' && b.kind === 'entry') { src = b; dst = a; relation = 'entry-exit'; }

      // optionnel : 1 seul lien par entry/exit
      const isBusy = (r: PortRef) => this.links.some(l =>
        l.relation === relation &&
        ((l.src.nodeId === r.nodeId && l.src.kind === r.kind && l.src.portIndex === r.portIndex) ||
          (l.dst.nodeId === r.nodeId && l.dst.kind === r.kind && l.dst.portIndex === r.portIndex)));

      if (src && dst && relation &&
        !(src.nodeId === dst.nodeId && src.portIndex === dst.portIndex) &&
        !(relation === 'entry-exit' && (isBusy(src) || isBusy(dst)))) {

        const mapJson =
          (relation === 'io' && src.kind === 'out')
            ? this.effectiveOutputMap(src.nodeId, src.portIndex)
            : {};

        this.links.push({
          id: String(this.nextLinkId++),
          src, dst, relation,
          map: mapJson
        });
      }

      if (relation === 'entry-exit') {
        const groupId = a.kind === 'entry' ? a.nodeId : b.nodeId;
        this.recomputeDownstreamFrom(groupId);
        this.pushFocusedGraph();
      }
    }

    this.pendingLink = null;
    this.pendingPreviewD = '';
    this.scheduleUpdateWires();
    this.pushFocusedGraph();
  }

  private portCenterWorld(ref: PortRef) {
    const cls =
      ref.kind === 'out' ? 'output' :
        ref.kind === 'in' ? 'input' :
          ref.kind === 'entry' ? 'entry' : 'exit';

    const sel = `[data-node-id="${ref.nodeId}"] .${cls}-port[data-index="${ref.portIndex}"]`;
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
    if (link.relation === 'io') this.recomputeDownstreamFrom(link.dst.nodeId);
    const groupIds = new Set<string>();
    if (link.relation === 'entry-exit') {
      // le groupé est celui qui détient l'entry
      const gid = link.src.kind === 'entry' ? link.src.nodeId :
        (link.dst.kind === 'entry' ? link.dst.nodeId : null);
      if (gid) groupIds.add(gid);
    }

    this.links = this.links.filter(l => l.id !== link.id);
    if (this.hoveredLinkId === link.id) this.hoveredLinkId = null;

    groupIds.forEach(gid => this.recomputeDownstreamFrom(gid));
    this.pushFocusedGraph();
    this.scheduleUpdateWires();
  }

  splitLink(link: GFlowLink) {
    if (!link.mid) return;

    // (optionnel) ne pas découper les liens entry→exit
    if (link.relation && link.relation !== 'io') {
      return;
    }

    const x0 = this.snapHalf(link.mid.x - this.nodeSize / 2);
    const y0 = this.snapHalf(link.mid.y - this.nodeSize / 2);

    const newNode = NodeFactory.createNode('agent', x0, y0);
    this.nodes.push(newNode);

    // Retire l'ancien lien
    this.links = this.links.filter(l => l.id !== link.id);

    // amont (conserve map existante)
    this.links.push({
      id: String(this.nextLinkId++),
      src: { ...link.src },
      dst: { nodeId: newNode.id, portIndex: 0, kind: 'in' },
      relation: 'io',
      map: this.deepClone(link.map ?? {})
    });

    // aval (accumulation du nouveau nœud)
    this.links.push({
      id: String(this.nextLinkId++),
      src: { nodeId: newNode.id, portIndex: 0, kind: 'out' },
      dst: { ...link.dst },
      relation: 'io',
      map: this.effectiveOutputMap(newNode.id, 0)
    });

    this.hoveredLinkId = null;
    this.scheduleUpdateWires();
  }

  private deepClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
  }
  private isPlainObject(v: any): v is Record<string, any> {
    return v && typeof v === 'object' && !Array.isArray(v);
  }
  private mergeJSON(a: JSON, b: JSON): JSON {
    if (this.isPlainObject(a) && this.isPlainObject(b)) {
      const out: any = { ...a };
      for (const k of Object.keys(b)) {
        out[k] = k in out ? this.mergeJSON((a as any)[k], (b as any)[k]) : this.deepClone((b as any)[k]);
      }
      return out;
    }
    // pour les scalaires/tableaux, on remplace par b
    return this.deepClone(b);
  }

  /** Fusionne toutes les maps des liens io entrants vers ce nœud */
  private aggregateIncomingMap(nodeId: string): JSON {
    const ins = this.links.filter(l => l.relation === 'io' && l.dst.nodeId === nodeId && l.dst.kind === 'in');
    let acc: JSON = {};
    for (const l of ins) acc = this.mergeJSON(acc, l.map ?? {});
    return acc;
  }

  private aggregatedChildrenMapForGroup(groupId: string): any {
    let acc: any = {};
    const entryLinks = this.links.filter(l =>
      l.relation === 'entry-exit' &&
      l.src.nodeId === groupId &&
      l.src.kind === 'entry' &&
      l.dst.kind === 'exit'
    );
    for (const lk of entryLinks) {
      const childId = lk.dst.nodeId;
      // on prend l’output effectif de l’agent enfant (port 0 par convention)
      const childMap = this.effectiveOutputMap(childId, 0);
      acc = this.mergeJSON(acc, childMap);
    }
    return acc;
  }

  /** JSON déclaré sur l'output du nœud (ex: outputs[i].map) */
  private nodeOutputOwnMap(nodeId: string, outIdx: number): JSON {
    const n = this.nodes.find(nn => nn.id === nodeId);
    return this.deepClone(n?.outputs?.[outIdx]?.map ?? {});
  }

  /** Map effective d'un output = entrées accumulées + apport de l'output */
  private effectiveOutputMap(nodeId: string, outIdx: number): JSON {
    const n = this.nodes.find(nn => nn.id === nodeId);
    if (!n) return {};

    if (n.type === 'agent-group') {
      // input existant + concat (merge) des maps des agents reliés
      const incoming = this.aggregateIncomingMap(nodeId);
      const children = this.aggregatedChildrenMapForGroup(nodeId);
      return this.mergeJSON(incoming, children);
    }

    const incoming = this.aggregateIncomingMap(nodeId);
    const own = this.nodeOutputOwnMap(nodeId, outIdx);
    return this.mergeJSON(incoming, own);
  }

  /** Recalcule toutes les maps des liens sortants à partir d'un nœud, puis propage */
  private recomputeDownstreamFrom(nodeId: string) {
    const q: string[] = [nodeId];
    const seen = new Set<string>();
    while (q.length) {
      const id = q.shift()!;
      // tous les liens io sortants
      const outs = this.links.filter(l => l.relation === 'io' && l.src.nodeId === id && l.src.kind === 'out');
      for (const l of outs) {
        const newMap = this.effectiveOutputMap(l.src.nodeId, l.src.portIndex);
        l.map = newMap;
        const dstId = l.dst.nodeId;
        if (!seen.has(dstId)) { seen.add(dstId); q.push(dstId); }
      }
    }
  }

  @ViewChild('configHost', { read: ViewContainerRef }) configHost!: ViewContainerRef;
  private configCmpRef: ComponentRef<any> | null = null;

  private loadConfigComponent() {
    if (!this.configHost) return;
    this.configHost.clear();
    this.configCmpRef?.destroy();
    this.configCmpRef = null;

    const n = this.focusedNode;
    if (!n?.configComponent) return;

    this.configCmpRef = this.configHost.createComponent(n.configComponent);
    this.configCmpRef.setInput('node', n);

    this.pushFocusedInputMap();
    this.pushFocusedGraph();

    const inst: any = this.configCmpRef.instance;
    if (inst?.configChange?.subscribe) {
      inst.configChange.subscribe((evt: any) => {
        if (!this.focusedNode) return;

        if (evt?.type === 'entry-removed') {
          this.removeGroupEntry(this.focusedNode, evt.index);
        }
        if (evt?.type === 'entries-changed') {
          // juste redessiner et recalculer la sortie groupée
          this.recomputeDownstreamFrom(this.focusedNode.id);
          this.scheduleUpdateWires();
        }

        // dans tous les cas
        this.pushFocusedGraph();
        this.cdr.markForCheck();
      });
    }
  }

  private removeGroupEntry(group: GFlowNode, idx: number) {
    // 1) supprimer le lien pour cette entry
    this.links = this.links.filter(l =>
      !(l.relation === 'entry-exit' &&
        l.src.nodeId === group.id && l.src.kind === 'entry' && l.src.portIndex === idx)
    );

    // 2) réindexer les liens des entries suivantes
    this.links.forEach(l => {
      if (l.relation === 'entry-exit' && l.src.nodeId === group.id && l.src.kind === 'entry' && l.src.portIndex > idx) {
        l.src.portIndex -= 1;
      }
    });

    // 3) retirer l’entry dans le node
    group.entries?.splice(idx, 1);

    // 4) recalcul des sorties du groupé (concat de ses enfants)
    this.recomputeDownstreamFrom(group.id);
    this.scheduleUpdateWires();
  }

  private pushFocusedInputMap() {
    if (!this.configCmpRef || !this.focusedNode) return;
    const inst: any = this.configCmpRef.instance;
    // on ne sait pas si le composant accepte 'inputMap' — setInput silencieux si non utilisé
    const inputMap = this.aggregateIncomingMap(this.focusedNode.id);
    this.configCmpRef.setInput?.('inputMap', this.deepClone(inputMap));
  }

  private pushFocusedGraph() {
    if (!this.configCmpRef) return;
    this.configCmpRef.setInput('nodes', this.nodes);
    this.configCmpRef.setInput('links', this.links);
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
    this.centerNode(this.nodes[this.nodes.length - 1]);
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
    let node = NodeFactory.createNode(it.type, x0, y0);
    this.nodes.push(node);
    this.focusNode(node);
    this.openConfig();
    this.scheduleUpdateWires();
  }

  /* ==================== CONFIGURATION (bouton +) ==================== */
  public configOpen = false;

  openConfig() {
    this.configOpen = true;
    this.loadConfigComponent();
  }

  closeConfig() {
    this.configOpen = false;
    this.focusNode(null);
  }

  private nodeUsesExit(n: GFlowNode): boolean {
    return this.links.some(l =>
      (l.src.nodeId === n.id && l.src.kind === 'exit') ||
      (l.dst.nodeId === n.id && l.dst.kind === 'exit'));
  }

  private nodeUsesIO(n: GFlowNode): boolean {
    return this.links.some(l =>
    ((l.src.nodeId === n.id && (l.src.kind === 'out' || l.src.kind === 'in')) ||
      (l.dst.nodeId === n.id && (l.dst.kind === 'out' || l.dst.kind === 'in'))));
  }

  public exitHidden(n: GFlowNode) { return n.type === 'agent' && this.nodeUsesIO(n); }
  public ioHidden(n: GFlowNode) { return n.type === 'agent' && this.nodeUsesExit(n); }
}
