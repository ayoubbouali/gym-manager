import { Component, DestroyRef, ElementRef, booleanAttribute, computed, forwardRef, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl, ControlValueAccessor, FormControl, NG_VALIDATORS, NG_VALUE_ACCESSOR, ReactiveFormsModule, ValidationErrors, Validator,
} from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule, SubscriptSizing } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { LucideAngularModule } from 'lucide-angular';
import { ConfigService } from '../core/config.service';
import { PhoneCountry } from '../core/models';

/**
 * Value of a phone field. `country` null: not chosen yet, the field opens on the country of a stored "+…" number,
 * otherwise on the club's country (the server reads a null country the same way).
 */
export interface PhoneValue { country: string | null; number: string; }

/** Country a stored number opens on: its dial code for "+…" (longest match, club's country then main country first), else the club's. */
export function phoneCountryOf(number: string, clubCountry: string, countries: PhoneCountry[]): string {
  if (!number.trim().startsWith('+')) return clubCountry;
  const digits = number.replace(/\D/g, '');
  const matching = countries.filter((c) => digits.startsWith(c.dialCode));
  const longest = Math.max(0, ...matching.map((c) => c.dialCode.length));
  const best = matching.filter((c) => c.dialCode.length === longest);
  return (best.find((c) => c.code === clubCountry) ?? best.find((c) => c.primary) ?? best[0])?.code ?? clubCountry;
}

/** Name or dial code: "maroc", "+212" and "212" all find Morocco. */
export function filterCountries(countries: PhoneCountry[], query: string): PhoneCountry[] {
  const q = normalize(query);
  if (!q) return countries;
  const digits = /^\+?\d+$/.test(q) ? q.replace('+', '') : '';
  return countries.filter((c) => (digits ? c.dialCode.startsWith(digits) : normalize(c.label).includes(q)));
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Phone number with its country: flag and "+dial code" button on the left opening a filterable list, number on the right. */
@Component({
  selector: 'app-phone-input',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatMenuModule, LucideAngularModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInput), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => PhoneInput), multi: true },
  ],
  host: { class: 'phone-input' },
  template: `
    <mat-form-field class="w-full" [subscriptSizing]="subscriptSizing()">
      @if (label()) {<mat-label>{{ label() }}</mat-label>}
      <button matPrefix type="button" class="phone-country" [matMenuTriggerFor]="menu" (menuOpened)="opened()" [disabled]="disabled()"
              [attr.aria-label]="'Pays du numéro : ' + (current()?.label ?? country())">
        <span [class]="'fi fi-' + country().toLowerCase()" aria-hidden="true"></span>
        <span class="phone-dial">+{{ current()?.dialCode ?? '' }}</span>
        <lucide-icon name="chevron-down" [size]="14" />
      </button>
      <input #number matInput type="tel" inputmode="tel" autocomplete="tel" [id]="inputId()" [formControl]="ctrl" [required]="required()"
             [placeholder]="current()?.example ?? ''" [errorStateMatcher]="matcher" [attr.aria-label]="label() ? null : 'Téléphone'"
             (blur)="onTouched()" />
      @if (hint()) {<mat-hint>{{ hint() }}</mat-hint>}
      @if (requiredError()) {<mat-error>Téléphone requis</mat-error>}
    </mat-form-field>
    <mat-menu #menu="matMenu" class="phone-country-menu" (closed)="query.set('')">
      <div class="phone-country-search" (click)="$event.stopPropagation()" (keydown)="searchKey($event)">
        <input #search type="search" placeholder="Pays ou indicatif" aria-label="Rechercher un pays ou un indicatif" autocomplete="off"
               [value]="query()" (input)="query.set(search.value)" />
      </div>
      @for (c of filtered(); track c.code) {
        <button mat-menu-item type="button" (click)="pick(c)">
          <span [class]="'fi fi-' + c.code.toLowerCase()" aria-hidden="true"></span>
          <span class="phone-country-name">{{ c.label }}</span><span class="muted">+{{ c.dialCode }}</span>
        </button>
      } @empty {
        <p class="muted small phone-country-empty">Aucun pays</p>
      }
    </mat-menu>
  `,
})
export class PhoneInput implements ControlValueAccessor, Validator {
  label = input('');
  hint = input('');
  inputId = input('');
  required = input(false, { transform: booleanAttribute });
  subscriptSizing = input<SubscriptSizing>('fixed');

  private config = inject(ConfigService);
  readonly ctrl = new FormControl('', { nonNullable: true });
  readonly query = signal('');
  readonly disabled = signal(false);
  /** Country picked in the list or written with the value; null: derived from the written number. */
  private chosen = signal<string | null>(null);
  private written = signal('');
  readonly country = computed(() => this.chosen() ?? phoneCountryOf(this.written(), this.config.country(), this.config.phoneCountries()));
  readonly current = computed(() => this.config.phoneCountries().find((c) => c.code === this.country()));
  readonly filtered = computed(() => filterCountries(this.config.phoneCountries(), this.query()));
  private numberInput = viewChild.required<ElementRef<HTMLInputElement>>('number');
  private searchInput = viewChild<ElementRef<HTMLInputElement>>('search');
  private outer: AbstractControl | null = null;

  matcher: ErrorStateMatcher = {
    isErrorState: (c, form) => !!(this.outer?.invalid && (c?.touched || this.outer?.touched || form?.submitted)),
  };

  private onChange: (v: PhoneValue) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    this.config.loadPhoneCountries();
    this.ctrl.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => this.emit());
  }

  requiredError(): boolean {
    return !!this.outer?.hasError('required');
  }

  opened(): void {
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  /** Typing stays in the search box (the menu would use letters to jump between items); arrows, Tab and Escape reach the menu. */
  searchKey(ev: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Tab', 'Escape'].includes(ev.key)) ev.stopPropagation();
  }

  pick(c: PhoneCountry): void {
    this.chosen.set(c.code);
    this.emit();
    this.numberInput().nativeElement.focus();
  }

  private emit(): void {
    this.onChange({ country: this.country(), number: this.ctrl.value });
  }

  writeValue(v: PhoneValue | string | null | undefined): void {
    const value = typeof v === 'string' ? { country: null, number: v } : v;
    this.chosen.set(value?.country ?? null);
    this.written.set(value?.number ?? '');
    this.ctrl.setValue(value?.number ?? '', { emitEvent: false });
  }

  registerOnChange(fn: (v: PhoneValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
    if (disabled) this.ctrl.disable({ emitEvent: false });
    else this.ctrl.enable({ emitEvent: false });
  }

  validate(control: AbstractControl): ValidationErrors | null {
    this.outer = control;
    return this.required() && !this.ctrl.value.trim() ? { required: true } : null;
  }
}
