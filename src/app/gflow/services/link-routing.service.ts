import { Injectable } from '@angular/core';
import { GFlowLink, PortRef } from '../core/gflow.types';

export interface PendingLink {
  from: PortRef;
  mouse: { x: number; y: number };
}

export interface LinkRoutingContext {
  links: GFlowLink[];
  pendingLink: PendingLink | null;
  portCenter: (ref: PortRef) => { x: number; y: number };
  baseStep: number;
}

@Injectable()
export class LinkRoutingService {
  recalculate(context: LinkRoutingContext): string {
    const { links, pendingLink, portCenter, baseStep } = context;

    const radius = baseStep * 0.75;
    const stub = baseStep;
    const aheadThreshold = baseStep * 4;

    for (const link of links) {
      const start = portCenter(link.src);
      const end = portCenter(link.dst);

      if (link.relation === 'entry-exit') {
        const route = this.routeManhattan(start, end, 'S', 'N', stub, radius);
        link.d = route.d;
        link.mid = route.mid;
        continue;
      }

      const ahead = end.x >= start.x + aheadThreshold;
      if (ahead) {
        const route = this.routeSoft(start, end, 'E', 'W', stub);
        link.d = route.d;
        link.mid = route.mid;
      } else {
        const route = this.routeManhattan(start, end, 'E', 'W', stub, radius);
        link.d = route.d;
        link.mid = route.mid;
      }
    }

    if (!pendingLink) {
      return '';
    }

    const sourcePoint = portCenter(pendingLink.from);
    const targetPoint = pendingLink.mouse;

    if (pendingLink.from.kind === 'entry' || pendingLink.from.kind === 'exit') {
      const route = this.routeSoft(
        sourcePoint,
        targetPoint,
        pendingLink.from.kind === 'entry' ? 'S' : 'N',
        pendingLink.from.kind === 'entry' ? 'N' : 'S',
        stub,
      );
      return route.d;
    }

    const dirA: 'E' | 'W' = pendingLink.from.kind === 'out' ? 'E' : 'W';
    const dirB: 'E' | 'W' = pendingLink.from.kind === 'out' ? 'W' : 'E';
    const ahead =
      dirA === 'E'
        ? targetPoint.x >= sourcePoint.x + aheadThreshold
        : sourcePoint.x >= targetPoint.x + aheadThreshold;

    const route = ahead
      ? this.routeSoft(sourcePoint, targetPoint, dirA, dirB, stub)
      : this.routeManhattan(sourcePoint, targetPoint, dirA, dirB, stub, radius);

    return route.d;
  }

  private routeSoft(
    a: { x: number; y: number },
    b: { x: number; y: number },
    dirA: 'E' | 'W' | 'N' | 'S',
    dirB: 'E' | 'W' | 'N' | 'S',
    stub: number,
  ): { d: string; mid: { x: number; y: number } } {
    const startStub = this.offset(a, dirA, stub);
    const endStub = this.offset(b, dirB, stub);

    const dx = Math.max(40, Math.abs(endStub.x - startStub.x) * 0.5);
    const control1 = { x: startStub.x + (dirA === 'E' ? dx : -dx), y: startStub.y };
    const control2 = { x: endStub.x + (dirB === 'W' ? -dx : dx), y: endStub.y };

    const d = [
      `M ${a.x} ${a.y}`,
      `L ${startStub.x} ${startStub.y}`,
      `C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${endStub.x} ${endStub.y}`,
      `L ${b.x} ${b.y}`,
    ].join(' ');

    const mid = this.cubicMidpoint(startStub, control1, control2, endStub);
    return { d, mid };
  }

  private routeManhattan(
    a: { x: number; y: number },
    b: { x: number; y: number },
    dirA: 'E' | 'W' | 'N' | 'S',
    dirB: 'E' | 'W' | 'N' | 'S',
    stub: number,
    radius: number,
  ): { d: string; mid: { x: number; y: number } } {
    const startStub = this.offset(a, dirA, stub);
    const endStub = this.offset(b, dirB, stub);

    const points: Array<{ x: number; y: number }> = [a, startStub];

    if (endStub.x - startStub.x >= stub) {
      const midX = (startStub.x + endStub.x) / 2;
      points.push({ x: midX, y: startStub.y }, { x: midX, y: endStub.y });
    } else {
      const verticalGap = stub * 2.5 * (endStub.y >= startStub.y ? 1 : -1);
      points.push({ x: startStub.x, y: startStub.y + verticalGap }, { x: endStub.x, y: startStub.y + verticalGap });
    }

    points.push(endStub, b);

    const d = this.roundedPath(points, radius);
    const mid = this.polylineMidpoint(points);
    return { d, mid };
  }

  private offset(point: { x: number; y: number }, direction: 'E' | 'W' | 'N' | 'S', distance: number) {
    switch (direction) {
      case 'E':
        return { x: point.x + distance, y: point.y };
      case 'W':
        return { x: point.x - distance, y: point.y };
      case 'N':
        return { x: point.x, y: point.y - distance };
      case 'S':
        return { x: point.x, y: point.y + distance };
    }
  }

  private roundedPath(points: Array<{ x: number; y: number }>, radius: number): string {
    if (points.length < 2) {
      return '';
    }

    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const current = points[i];
      const next = points[i + 1];

      if (!next) {
        d += ` L ${current.x} ${current.y}`;
        break;
      }

      const v1 = { x: prev.x - current.x, y: prev.y - current.y };
      const v2 = { x: next.x - current.x, y: next.y - current.y };
      const len1 = Math.hypot(v1.x, v1.y);
      const len2 = Math.hypot(v2.x, v2.y);

      if (!len1 || !len2) {
        continue;
      }

      const cornerRadius = Math.min(radius, len1 / 2, len2 / 2);
      const pA = { x: current.x + (v1.x / len1) * cornerRadius, y: current.y + (v1.y / len1) * cornerRadius };
      const pB = { x: current.x + (v2.x / len2) * cornerRadius, y: current.y + (v2.y / len2) * cornerRadius };

      d += ` L ${pA.x} ${pA.y} Q ${current.x} ${current.y} ${pB.x} ${pB.y}`;
    }

    return d;
  }

  private polylineMidpoint(points: Array<{ x: number; y: number }>): { x: number; y: number } {
    let totalLength = 0;
    const segments: number[] = [];

    for (let i = 1; i < points.length; i++) {
      const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      segments.push(length);
      totalLength += length;
    }

    let target = totalLength / 2;
    for (let i = 1; i < points.length; i++) {
      if (target <= segments[i - 1]) {
        const ratio = target / segments[i - 1];
        const start = points[i - 1];
        const end = points[i];
        return {
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio,
        };
      }
      target -= segments[i - 1];
    }

    return points[Math.floor(points.length / 2)] ?? points[0];
  }

  private cubicMidpoint(
    start: { x: number; y: number },
    control1: { x: number; y: number },
    control2: { x: number; y: number },
    end: { x: number; y: number },
  ): { x: number; y: number } {
    const t = 0.5;
    const u = 1 - t;

    const midX =
      u * u * u * start.x + 3 * u * u * t * control1.x + 3 * u * t * t * control2.x + t * t * t * end.x;
    const midY =
      u * u * u * start.y + 3 * u * u * t * control1.y + 3 * u * t * t * control2.y + t * t * t * end.y;

    return { x: midX, y: midY };
  }
}
