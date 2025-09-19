import { Injectable } from '@angular/core';

@Injectable()
export class GflowViewportService {
  ox = 0;
  oy = 0;
  scale = 1;

  readonly baseStep = 24;
  readonly baseDot = 1;

  private viewport: HTMLElement | null = null;

  get nodeSize(): number {
    return 4 * this.baseStep;
  }

  setViewport(element: HTMLElement) {
    this.viewport = element;
  }

  getViewport(): HTMLElement | null {
    return this.viewport;
  }

  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.viewport) {
      return { x: clientX, y: clientY };
    }

    const rect = this.viewport.getBoundingClientRect();
    const vx = clientX - rect.left;
    const vy = clientY - rect.top;
    return {
      x: (vx - this.ox) / this.scale,
      y: (vy - this.oy) / this.scale,
    };
  }

  snap(value: number): number {
    const g = this.baseStep;
    return Math.round((value + g) / g) * g - g;
  }

  applyWheel(event: WheelEvent) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.001);
    const previous = this.scale;
    this.scale = Math.min(2, Math.max(0.25, this.scale * factor));

    if (!this.viewport) {
      return;
    }

    const rect = this.viewport.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;

    this.ox = cx - (cx - this.ox) * (this.scale / previous);
    this.oy = cy - (cy - this.oy) * (this.scale / previous);
  }

  moveBy(dx: number, dy: number) {
    this.ox += dx;
    this.oy += dy;
  }

  centerOn(worldX: number, worldY: number, width: number, height: number) {
    if (!this.viewport) {
      return;
    }

    const rect = this.viewport.getBoundingClientRect();
    const vx = rect.width / 2;
    const vy = rect.height / 2;
    const wx = worldX + width / 2;
    const wy = worldY + height / 2;

    this.ox = vx - wx * this.scale;
    this.oy = vy - wy * this.scale;
  }
}
