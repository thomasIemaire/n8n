import { Injectable, NgZone } from '@angular/core';
import { GflowViewportService } from './gflow-viewport.service';
import { GflowStateService } from './gflow-state.service';
import { PortRef } from '../core/gflow.types';

export interface PendingLink {
  from: PortRef;
  mouse: { x: number; y: number };
}

@Injectable()
export class GflowRendererService {
  private viewport: HTMLElement | null = null;
  private rafId: number | null = null;
  private onRendered: (() => void) | null = null;
  private pendingLink: PendingLink | null = null;
  private pendingPreviewD = '';

  constructor(
    private readonly zone: NgZone,
    private readonly viewportService: GflowViewportService,
    private readonly state: GflowStateService,
  ) {}

  initialize(viewport: HTMLElement, onRendered: () => void) {
    this.viewport = viewport;
    this.viewportService.setViewport(viewport);
    this.onRendered = onRendered;
    this.schedule();
  }

  dispose() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  schedule() {
    if (this.rafId !== null) {
      return;
    }

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.zone.runOutsideAngular(() => this.recalculate());
      this.zone.run(() => this.onRendered?.());
    });
  }

  updatePendingLink(link: PendingLink | null) {
    this.pendingLink = link;
    this.schedule();
  }

  get previewPath(): string {
    return this.pendingPreviewD;
  }

  private recalculate() {
    const radius = this.viewportService.baseStep * 0.75;
    const stub = this.viewportService.baseStep;
    const aheadThreshold = this.viewportService.baseStep * 4;

    for (const link of this.state.links) {
      const p1 = this.portCenterWorld(link.src);
      const p2 = this.portCenterWorld(link.dst);

      if (link.relation === 'entry-exit') {
        const route = this.routeManhattan(p1, p2, 'S', 'N', stub, radius);
        link.d = route.d;
        link.mid = route.mid;
      } else {
        const ahead = p2.x >= p1.x + aheadThreshold;
        if (ahead) {
          const route = this.routeSoft(p1, p2, 'E', 'W', stub);
          link.d = route.d;
          link.mid = route.mid;
        } else {
          const route = this.routeManhattan(p1, p2, 'E', 'W', stub, radius);
          link.d = route.d;
          link.mid = route.mid;
        }
      }
    }

    if (this.pendingLink) {
      const p1 = this.portCenterWorld(this.pendingLink.from);
      const p2 = this.pendingLink.mouse;

      if (this.pendingLink.from.kind === 'entry' || this.pendingLink.from.kind === 'exit') {
        const route = this.routeSoft(
          p1,
          p2,
          this.pendingLink.from.kind === 'entry' ? 'S' : 'N',
          this.pendingLink.from.kind === 'entry' ? 'N' : 'S',
          stub,
        );
        this.pendingPreviewD = route.d;
      } else {
        const dirA: 'E' | 'W' = this.pendingLink.from.kind === 'out' ? 'E' : 'W';
        const dirB: 'E' | 'W' = this.pendingLink.from.kind === 'out' ? 'W' : 'E';
        const ahead = dirA === 'E' ? p2.x >= p1.x + aheadThreshold : p1.x >= p2.x + aheadThreshold;
        const route = ahead
          ? this.routeSoft(p1, p2, dirA, dirB, stub)
          : this.routeManhattan(p1, p2, dirA, dirB, stub, radius);
        this.pendingPreviewD = route.d;
      }
    } else {
      this.pendingPreviewD = '';
    }
  }

  private portCenterWorld(ref: PortRef) {
    const cls =
      ref.kind === 'out'
        ? 'output'
        : ref.kind === 'in'
          ? 'input'
          : ref.kind === 'entry'
            ? 'entry'
            : 'exit';

    if (!this.viewport) {
      return { x: 0, y: 0 };
    }

    const selector = `[data-node-id="${ref.nodeId}"] .${cls}-port[data-index="${ref.portIndex}"]`;
    const el = this.viewport.querySelector(selector) as HTMLElement | null;
    if (!el) {
      return { x: 0, y: 0 };
    }

    const portRect = el.getBoundingClientRect();
    const viewportRect = this.viewport.getBoundingClientRect();
    const cx = portRect.left + portRect.width / 2 - viewportRect.left;
    const cy = portRect.top + portRect.height / 2 - viewportRect.top;
    return {
      x: (cx - this.viewportService.ox) / this.viewportService.scale,
      y: (cy - this.viewportService.oy) / this.viewportService.scale,
    };
  }

  private routeSoft(
    a: { x: number; y: number },
    b: { x: number; y: number },
    dirA: 'E' | 'W' | 'N' | 'S',
    dirB: 'E' | 'W' | 'N' | 'S',
    stub: number,
  ): { d: string; mid: { x: number; y: number } } {
    const pA = this.offset(a, dirA, stub);
    const pB = this.offset(b, dirB, stub);

    const dx = Math.max(40, Math.abs(pB.x - pA.x) * 0.5);
    const c1 = { x: pA.x + (dirA === 'E' ? dx : -dx), y: pA.y };
    const c2 = { x: pB.x + (dirB === 'W' ? -dx : dx), y: pB.y };

    const d = [`M ${a.x} ${a.y}`, `L ${pA.x} ${pA.y}`, `C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${pB.x} ${pB.y}`, `L ${b.x} ${b.y}`].join(' ');

    const t = 0.5;
    const u = 1 - t;
    const midX =
      u * u * u * pA.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * pB.x;
    const midY =
      u * u * u * pA.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * pB.y;

    return { d, mid: { x: midX, y: midY } };
  }

  private routeManhattan(
    a: { x: number; y: number },
    b: { x: number; y: number },
    dirA: 'E' | 'W' | 'N' | 'S',
    dirB: 'E' | 'W' | 'N' | 'S',
    stub: number,
    radius: number,
  ): { d: string; mid: { x: number; y: number } } {
    const pA = this.offset(a, dirA, stub);
    const pB = this.offset(b, dirB, stub);
    const points: Array<{ x: number; y: number }> = [a, pA];

    if (pB.x - pA.x >= stub) {
      const mx = (pA.x + pB.x) / 2;
      points.push({ x: mx, y: pA.y }, { x: mx, y: pB.y });
    } else {
      const vgap = stub * 2.5 * (pB.y >= pA.y ? 1 : -1);
      points.push({ x: pA.x, y: pA.y + vgap }, { x: pB.x, y: pA.y + vgap });
    }

    points.push(pB, b);

    const d = this.roundedPath(points, radius);
    const mid = this.polylineMidpoint(points);
    return { d, mid };
  }

  private offset(p: { x: number; y: number }, dir: 'E' | 'W' | 'N' | 'S', distance: number) {
    switch (dir) {
      case 'E':
        return { x: p.x + distance, y: p.y };
      case 'W':
        return { x: p.x - distance, y: p.y };
      case 'N':
        return { x: p.x, y: p.y - distance };
      case 'S':
        return { x: p.x, y: p.y + distance };
    }
  }

  private roundedPath(points: Array<{ x: number; y: number }>, radius: number): string {
    if (points.length < 2) {
      return '';
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      if (!p2) {
        d += ` L ${p1.x} ${p1.y}`;
        break;
      }
      const v1 = { x: p0.x - p1.x, y: p0.y - p1.y };
      const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
      const l1 = Math.hypot(v1.x, v1.y);
      const l2 = Math.hypot(v2.x, v2.y);
      if (!l1 || !l2) {
        continue;
      }
      const rr = Math.min(radius, l1 / 2, l2 / 2);
      const pA = { x: p1.x + (v1.x / l1) * rr, y: p1.y + (v1.y / l1) * rr };
      const pB = { x: p1.x + (v2.x / l2) * rr, y: p1.y + (v2.y / l2) * rr };
      d += ` L ${pA.x} ${pA.y} Q ${p1.x} ${p1.y} ${pB.x} ${pB.y}`;
    }
    return d;
  }

  private polylineMidpoint(points: Array<{ x: number; y: number }>): { x: number; y: number } {
    let length = 0;
    const segments: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const segmentLength = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      segments.push(segmentLength);
      length += segmentLength;
    }

    let distance = length / 2;
    for (let i = 1; i < points.length; i++) {
      if (distance <= segments[i - 1]) {
        const ratio = distance / segments[i - 1];
        const p0 = points[i - 1];
        const p1 = points[i];
        return { x: p0.x + (p1.x - p0.x) * ratio, y: p0.y + (p1.y - p0.y) * ratio };
      }
      distance -= segments[i - 1];
    }

    return points[Math.floor(points.length / 2)] ?? points[0];
  }
}
