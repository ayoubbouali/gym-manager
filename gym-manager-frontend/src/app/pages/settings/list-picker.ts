import { Component, computed, effect, input, model, signal } from '@angular/core';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface PickOption { value: string; label: string; }

const MAX_SHOWN = 100;

/** Filterable input restricted to a list: a typed text that matches no option is reverted on blur. */
@Component({
  selector: 'app-list-picker',
  imports: [MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  template: `
    <mat-form-field subscriptSizing="dynamic" class="w-full max-480">
      <input matInput [id]="inputId()" [value]="text()" (input)="text.set(inputValue($event))" (blur)="onBlur()"
        [matAutocomplete]="auto" [attr.aria-label]="ariaLabel()" autocomplete="off" />
      <mat-autocomplete #auto="matAutocomplete" [displayWith]="labelOf" (optionSelected)="pick($event)" (closed)="restore()" autoActiveFirstOption>
        @for (o of filtered(); track o.value) {<mat-option [value]="o.value">{{ o.label }}</mat-option>}
      </mat-autocomplete>
      @if (hint()) {<mat-hint>{{ hint() }}</mat-hint>}
    </mat-form-field>
  `,
})
export class ListPicker {
  options = input.required<PickOption[]>();
  value = model('');
  inputId = input('');
  ariaLabel = input('');
  hint = input('');
  text = signal('');

  private labels = computed(() => new Map(this.options().map((o) => [o.value, o.label])));
  /** The whole list while the field shows the current value, otherwise the options matching the typed text. */
  filtered = computed(() => {
    const typed = this.text();
    const q = typed === this.labelOf(this.value()) ? '' : normalize(typed);
    return (q ? this.options().filter((o) => normalize(o.label).includes(q)) : this.options()).slice(0, MAX_SHOWN);
  });

  labelOf = (value: string): string => this.labels().get(value) ?? value ?? '';

  constructor() {
    effect(() => this.text.set(this.labelOf(this.value())));
  }

  inputValue(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  pick(ev: MatAutocompleteSelectedEvent): void {
    this.value.set(ev.option.value);
    this.text.set(this.labelOf(ev.option.value));
  }

  /** With options shown, the panel's (closed) restores instead: reverting here would remove the option being clicked. */
  onBlur(): void {
    if (!this.filtered().length) this.restore();
  }

  restore(): void {
    this.text.set(this.labelOf(this.value()));
  }
}

/** Case-, accent- and underscore-insensitive ("buenos aires" finds America/Argentina/Buenos_Aires). */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').toLowerCase().trim();
}
