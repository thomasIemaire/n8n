import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ComponentRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  Type,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Subscription } from 'rxjs';

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
        <ng-container #componentHost></ng-container>
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
export class ConfigBase implements AfterViewInit, OnChanges, OnDestroy {
  @Input() title = '';
  @Input() cancelLabel = 'Annuler';
  @Input() saveLabel = 'Sauvegarder';
  @Input() component: Type<unknown> | null = null;
  @Input() componentInputs: Record<string, unknown> | null = null;

  @Output() cancel = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() configChange = new EventEmitter<unknown>();

  @ViewChild('componentHost', { read: ViewContainerRef }) componentHost!: ViewContainerRef;

  private innerRef: ComponentRef<unknown> | null = null;
  private configSub: Subscription | null = null;
  private viewReady = false;

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderComponent();
    this.applyInputs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) {
      return;
    }

    if (changes['component']) {
      this.renderComponent();
    }

    if (changes['componentInputs']) {
      this.applyInputs();
    }
  }

  ngOnDestroy(): void {
    this.destroyInner();
  }

  onCancelClick() { this.cancel.emit(); }
  onSaveClick() { this.save.emit(); }

  private renderComponent() {
    this.destroyInner();

    if (!this.component || !this.componentHost) {
      return;
    }

    this.innerRef = this.componentHost.createComponent(this.component);
    this.bindOutputs();
    this.applyInputs();
  }

  private applyInputs() {
    if (!this.innerRef || !this.componentInputs) {
      return;
    }

    for (const [key, value] of Object.entries(this.componentInputs)) {
      if (this.innerRef.setInput) {
        this.innerRef.setInput(key, value);
      } else {
        (this.innerRef.instance as Record<string, unknown>)[key] = value;
      }
    }
  }

  private bindOutputs() {
    const instance: any = this.innerRef?.instance;
    const emitter = instance?.configChange;

    if (emitter?.subscribe) {
      this.configSub = emitter.subscribe((evt: unknown) => this.configChange.emit(evt));
    }
  }

  private destroyInner() {
    if (this.configSub) {
      this.configSub.unsubscribe();
      this.configSub = null;
    }

    if (this.innerRef) {
      this.innerRef.destroy();
      this.innerRef = null;
    }

    if (this.componentHost) {
      this.componentHost.clear();
    }
  }
}
