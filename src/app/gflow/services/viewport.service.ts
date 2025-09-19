import { Injectable } from '@angular/core';

@Injectable()
export class ViewportService {
  ox = 0;
  oy = 0;
  scale = 1;

  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private panMoved = false;
  private skipNextClick = false;

  beginPan(event: MouseEvent): void {
    this.isPanning = true;
    this.panMoved = false;
    this.panStart = { x: event.clientX, y: event.clientY };
  }

  pan(event: MouseEvent): boolean {
    if (!this.isPanning || !(event.buttons & 1)) {
      return false;
    }

    if (!this.panMoved) {
      const dx = Math.abs(event.clientX - this.panStart.x);
      const dy = Math.abs(event.clientY - this.panStart.y);
      if (dx + dy > 3) {
        this.panMoved = true;
      }
    }

    this.ox += event.movementX;
    this.oy += event.movementY;
    return true;
  }

  endPan(): void {
    if (this.isPanning && this.panMoved) {
      this.skipNextClick = true;
    }
    this.isPanning = false;
    this.panMoved = false;
  }

  skipNextClickOnce(): void {
    this.skipNextClick = true;
  }

  consumeClick(): boolean {
    if (!this.skipNextClick) {
      return false;
    }
    this.skipNextClick = false;
    return true;
  }

  handleWheel(event: WheelEvent, viewport: HTMLElement): boolean {
    const previousScale = this.scale;
    const factor = Math.exp(-event.deltaY * 0.001);
    this.scale = Math.min(2, Math.max(0.25, this.scale * factor));

    if (this.scale === previousScale) {
      return false;
    }

    const rect = viewport.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;

    this.ox = cx - (cx - this.ox) * (this.scale / previousScale);
    this.oy = cy - (cy - this.oy) * (this.scale / previousScale);
    return true;
  }

  toWorld(event: MouseEvent, viewport: HTMLElement): { x: number; y: number } {
    const rect = viewport.getBoundingClientRect();
    const vx = event.clientX - rect.left;
    const vy = event.clientY - rect.top;
    return { x: (vx - this.ox) / this.scale, y: (vy - this.oy) / this.scale };
  }
}
