import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-config-base',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  template: `
    <div class="config-base">
      <header class="config-base__header" *ngIf="title">
        <h3 class="config-base__title">{{ title }}</h3>
      </header>

      <section class="config-base__body">
        <ng-content></ng-content>
      </section>

      <footer class="config-base__footer">
        <p-button
          [label]="cancelLabel"
          severity="secondary"
          size="small"
          (click)="onCancelClick()" />

        <p-button
          [label]="saveLabel"
          icon="pi pi-check"
          size="small"
          (click)="onSaveClick()" />
      </footer>
    </div>
  `,
  styles: [`
    .config-base { display: flex; flex-direction: column; height: 100%; gap: 1rem; }
    .config-base__header { border-bottom: 1px solid var(--surface-300); padding-bottom: .5rem; }
    .config-base__title { margin: 0; font-size: 1.1rem; font-weight: 600; }
    .config-base__body { flex: 1 1 auto; overflow: auto; display: flex; flex-direction: column; gap: .75rem; }
    .config-base__footer { display: flex; justify-content: flex-end; gap: .5rem; border-top: 1px solid var(--surface-300); padding-top: .5rem; }
  `],
})
export class ConfigBase {
  @Input() title = '';
  @Input() cancelLabel = 'Annuler';
  @Input() saveLabel = 'Sauvegarder';
  @Output() cancel = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  onCancelClick() { this.cancel.emit(); }
  onSaveClick() { this.save.emit(); }
}