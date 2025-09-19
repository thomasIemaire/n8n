import { CommonModule, JsonPipe } from '@angular/common';
import { Component, Input, TrackByFunction } from '@angular/core';
import { TabsModule } from 'primeng/tabs';
import { GFlowLink, GFlowPort } from '../../../gflow/core/gflow.types';

type Direction = 'incoming' | 'outgoing';

@Component({
  selector: 'app-node-io-panel',
  standalone: true,
  imports: [CommonModule, TabsModule, JsonPipe],
  template: `
    <p-tabs [value]="0" *ngIf="hasPorts; else noPorts">
      <p-tablist>
        <p-tab [value]="i" *ngFor="let port of ports ?? []; let i = index">
          {{ port.name || defaultTabLabel }}
        </p-tab>
      </p-tablist>
      <p-tabpanels>
        <p-tabpanel [value]="i" *ngFor="let port of ports ?? []; let i = index">
          <ng-container *ngIf="linksAt(i) as portLinks">
            <ng-container *ngIf="portLinks.length; else noLink">
              <div class="map-list">
                <div class="map-card" *ngFor="let link of portLinks; trackBy: trackByWrapper">
                  <div class="map-card__meta">{{ metaFor(link) }}</div>
                  <pre class="map-card__json">{{ link.map | json }}</pre>
                </div>
              </div>
            </ng-container>
          </ng-container>
          <ng-template #noLink>
            <em>{{ emptyMessage }}</em>
          </ng-template>
        </p-tabpanel>
      </p-tabpanels>
    </p-tabs>
    <ng-template #noPorts>
      <ng-container *ngIf="noPortsMessage">
        <em>{{ noPortsMessage }}</em>
      </ng-container>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }
    .map-list { display: grid; gap: .75rem; }
    .map-card { border: 1px solid var(--surface-300); border-radius: .75rem; padding: .75rem; background: var(--surface-0); }
    .map-card__meta { font-size: .85rem; font-weight: 500; margin-bottom: .5rem; color: var(--text-color); }
    .map-card__json { margin: 0; font-size: .8rem; white-space: pre-wrap; word-break: break-word; }
  `],
})
export class NodeIoPanelComponent {
  @Input() ports: GFlowPort[] | null = null;
  @Input() linksByIndex: GFlowLink[][] = [];
  @Input() nodeNameFn: (id: string) => string = (id: string) => id;
  @Input() emptyMessage = 'Aucun lien disponible pour ce port.';
  @Input() noPortsMessage = '';
  @Input() direction: Direction = 'incoming';
  @Input() trackBy: TrackByFunction<GFlowLink> = (_i, link) => link.id;

  get hasPorts(): boolean {
    return !!this.ports && this.ports.length > 0;
  }

  get defaultTabLabel(): string {
    return this.direction === 'incoming' ? 'input' : 'output';
  }

  linksAt(index: number): GFlowLink[] {
    return this.linksByIndex?.[index] ?? [];
  }

  metaFor(link: GFlowLink): string {
    if (this.direction === 'incoming') {
      return `De ${this.nodeNameFn(link.src.nodeId)} (output ${link.src.portIndex})`;
    }
    return `Vers ${this.nodeNameFn(link.dst.nodeId)} (input ${link.dst.portIndex})`;
  }

  trackByWrapper: TrackByFunction<GFlowLink> = (index, link) => this.trackBy(index, link);
}
