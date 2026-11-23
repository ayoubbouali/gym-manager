import { Component, DestroyRef, OnChanges, booleanAttribute, computed, forwardRef, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl, ControlValueAccessor, FormControl, NG_VALIDATORS, NG_VALUE_ACCESSOR, ReactiveFormsModule, ValidationErrors, Validator,
} from '@angular/forms';
import { DateAdapter, ErrorStateMatcher, MAT_DATE_FORMATS, MatDateFormats } from '@angular/material/core';
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule, SubscriptSizing } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { LucideAngularModule } from 'lucide-angular';
import { DAY_FORMAT, MONTH_FORMAT, dateToIso, isoToDate } from '../core/date-adapter';

/**
 * Inserts the slashes while digits are typed or pasted: '05' -> '05/', '05112026' -> '05/11/2026' ('112026' -> '11/2026' in month mode).
 * Text already holding separators is left as typed (tolerant input such as '5/1/2026'); too many digits are left as typed too,
 * so the parser reports them instead of silently dropping some. A '-' typed after four digits means an ISO date
 * (2026-11-05): the slashes inserted in the year are removed.
 */
export function autoSlash(text: string, month: boolean): string {
  const iso = /^(\d{2})\/(\d{2})\/?-$/.exec(text);
  if (iso) return `${iso[1]}${iso[2]}-`;
  if (/^\d+$/.test(text)) {
    if (text.length > (month ? 6 : 8)) return text;
    const groups = month ? [text.slice(0, 2), text.slice(2, 6)] : [text.slice(0, 2), text.slice(2, 4), text.slice(4, 8)];
    const filled = groups.filter((g) => g);
    const last = filled.length - 1;
    // A complete group that is not the year gets its slash right away.
    return filled.join('/') + (last < groups.length - 1 && filled[last].length === 2 ? '/' : '');
  }
  if (!month && /^\d{1,2}\/\d{2}$/.test(text)) return text + '/';
  return text.replace(/\/\/$/, '/');
}

/**
 * Date (or month) field: typed as jj/mm/aaaa or picked in a calendar.
 * Exchanges the same value as the former native inputs: 'yyyy-mm-dd' ('yyyy-mm' in month mode), null when empty or invalid.
 */
@Component({
  selector: 'app-date-field',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, LucideAngularModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateField), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DateField), multi: true },
    // Own copy of the formats: month mode changes the input text format of this field only.
    { provide: MAT_DATE_FORMATS, useFactory: () => {
      const f = inject(MAT_DATE_FORMATS, { skipSelf: true });
      return { parse: { ...f.parse }, display: { ...f.display } };
    } },
  ],
  host: { class: 'date-field' },
  template: `
    <mat-form-field class="w-full" [subscriptSizing]="subscriptSizing()">
      <mat-label>{{ label() }}</mat-label>
      <input matInput [matDatepicker]="picker" [formControl]="ctrl" [min]="minDate()" [max]="maxDate()" [required]="required()"
             [errorStateMatcher]="matcher" [placeholder]="isMonth() ? 'mm/aaaa' : 'jj/mm/aaaa'" autocomplete="off" (input)="maskInput($event)" (blur)="onTouched()" />
      <mat-datepicker-toggle matIconSuffix [for]="picker">
        <lucide-icon matDatepickerToggleIcon [name]="isMonth() ? 'calendar-range' : 'calendar-days'" [size]="18" />
      </mat-datepicker-toggle>
      <mat-datepicker #picker panelClass="app-datepicker" [startView]="isMonth() ? 'multi-year' : 'month'"
                      (monthSelected)="pickMonth($event, picker)" (closed)="onTouched()" />
      @if (hint()) {<mat-hint>{{ hint() }}</mat-hint>}
      @if (ctrl.hasError('matDatepickerParse')) {
        <mat-error>{{ isMonth() ? 'Mois invalide (mm/aaaa)' : 'Date invalide (jj/mm/aaaa)' }}</mat-error>
      } @else if (ctrl.hasError('matDatepickerMin')) {
        <mat-error>Au plus tôt le {{ show(ctrl.getError('matDatepickerMin').min) }}</mat-error>
      } @else if (ctrl.hasError('matDatepickerMax')) {
        <mat-error>Au plus tard le {{ show(ctrl.getError('matDatepickerMax').max) }}</mat-error>
      } @else if (ctrl.hasError('required')) {
        <mat-error>{{ isMonth() ? 'Mois requis' : 'Date requise' }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class DateField implements ControlValueAccessor, Validator, OnChanges {
  label = input('');
  hint = input('');
  /** Bounds as ISO strings, like the value. */
  min = input<string | null | undefined>(null);
  max = input<string | null | undefined>(null);
  required = input(false, { transform: booleanAttribute });
  subscriptSizing = input<SubscriptSizing>('fixed');
  mode = input<'date' | 'month'>('date');

  isMonth = computed(() => this.mode() === 'month');
  minDate = computed(() => isoToDate(this.min()));
  maxDate = computed(() => isoToDate(this.max()));

  readonly ctrl = new FormControl<Date | null>(null);
  private formats = inject<MatDateFormats>(MAT_DATE_FORMATS);
  private adapter = inject<DateAdapter<Date>>(DateAdapter);
  private value: string | null = null;
  /** Outer control, known from validate(): its errors and touched state colour the field too. */
  private outer: AbstractControl | null = null;

  matcher: ErrorStateMatcher = {
    isErrorState: (c, form) =>
      !!((c?.invalid || this.outer?.invalid) && (c?.touched || this.outer?.touched || form?.submitted)),
  };

  private onChange: (v: string | null) => void = () => {};
  private onValidatorChange: () => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    this.ctrl.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((d) => {
      const iso = dateToIso(d, this.isMonth());
      if (iso !== this.value) {
        this.value = iso;
        this.onChange(iso);
      } else {
        // Same value but validity changed (e.g. unparsable text over an empty field): only revalidate the outer control.
        this.onValidatorChange();
      }
    });
  }

  ngOnChanges(): void {
    const format = this.isMonth() ? MONTH_FORMAT : DAY_FORMAT;
    this.formats.parse.dateInput = format;
    this.formats.display.dateInput = format;
  }

  pickMonth(date: Date, picker: MatDatepicker<Date>): void {
    if (!this.isMonth()) return;
    this.ctrl.setValue(new Date(date.getFullYear(), date.getMonth(), 1));
    this.ctrl.markAsTouched();
    picker.close();
  }

  /** Only on insertion with the caret at the end: deleting or editing in the middle stays free. */
  maskInput(event: Event): void {
    const type = (event as InputEvent).inputType;
    const el = event.target as HTMLInputElement;
    if ((type !== 'insertText' && type !== 'insertFromPaste') || el.selectionStart !== el.value.length) return;
    const masked = autoSlash(el.value, this.isMonth());
    if (masked === el.value) return;
    el.value = masked;
    // Plain re-dispatch (no inputType, so not masked again) for the datepicker input to parse the new text.
    el.dispatchEvent(new Event('input'));
  }

  show(d: Date): string {
    return this.adapter.format(d, this.formats.display.dateInput);
  }

  writeValue(v: string | null | undefined): void {
    const date = isoToDate(v);
    this.value = dateToIso(date, this.isMonth());
    this.ctrl.setValue(date, { emitEvent: false });
  }

  registerOnChange(fn: (v: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  setDisabledState(disabled: boolean): void {
    if (disabled) this.ctrl.disable({ emitEvent: false });
    else this.ctrl.enable({ emitEvent: false });
  }

  validate(control: AbstractControl): ValidationErrors | null {
    this.outer = control;
    const { matDatepickerParse, matDatepickerMin, matDatepickerMax } = this.ctrl.errors ?? {};
    const errors = { ...(matDatepickerParse && { matDatepickerParse }), ...(matDatepickerMin && { matDatepickerMin }), ...(matDatepickerMax && { matDatepickerMax }) };
    if (this.required() && !this.value && !matDatepickerParse) Object.assign(errors, { required: true });
    return Object.keys(errors).length ? errors : null;
  }
}
