import { Component, importProvidersFrom } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatDatepicker } from '@angular/material/datepicker';
import { By } from '@angular/platform-browser';
import { LucideAngularModule } from 'lucide-angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideFrDates } from '../core/date-adapter';
import { APP_ICONS } from '../core/icons';
import { DateField } from './date-field';

@Component({
  imports: [ReactiveFormsModule, DateField],
  template: `<app-date-field label="Date" [formControl]="ctrl" [min]="min" [max]="max" required />`,
})
class ReactiveHost {
  ctrl = new FormControl<string | null>(null, Validators.required);
  min: string | null = null;
  max: string | null = '2026-11-22';
}

@Component({
  imports: [FormsModule, DateField],
  template: `<app-date-field label="Mois" mode="month" [(ngModel)]="month" max="2026-11" />`,
})
class MonthHost {
  month: string | null = '2026-11';
}

function input<T>(f: ComponentFixture<T>): HTMLInputElement {
  return f.nativeElement.querySelector('app-date-field input');
}

function type<T>(f: ComponentFixture<T>, text: string): void {
  const el = input(f);
  el.value = text;
  el.dispatchEvent(new Event('input'));
  el.dispatchEvent(new Event('blur'));
  f.detectChanges();
}

function picker<T>(f: ComponentFixture<T>): MatDatepicker<Date> {
  return f.debugElement.query(By.directive(MatDatepicker)).componentInstance;
}

describe('champ date (app-date-field)', () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideFrDates(), importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
  });

  async function reactive(value: string | null = null) {
    const f = TestBed.createComponent(ReactiveHost);
    f.componentInstance.ctrl.setValue(value);
    f.detectChanges();
    await f.whenStable();
    return f;
  }

  it('affiche une valeur initiale ISO au format jj/mm/aaaa', async () => {
    const f = await reactive('2026-11-01');
    expect(input(f).value).toBe('01/11/2026');
    expect(f.componentInstance.ctrl.valid).toBe(true);
  });

  it('accepte une saisie clavier tolérante et la normalise', async () => {
    const f = await reactive();
    type(f, '5/1/2026');
    expect(f.componentInstance.ctrl.value).toBe('2026-01-05');
    expect(input(f).value).toBe('05/01/2026');
    expect(f.componentInstance.ctrl.valid).toBe(true);
  });

  it('remplit le champ avec le jour choisi au calendrier', async () => {
    const f = await reactive();
    picker(f).select(new Date(2026, 10, 15));
    f.detectChanges();
    expect(f.componentInstance.ctrl.value).toBe('2026-11-15');
    expect(input(f).value).toBe('15/11/2026');
  });

  it('passe en erreur « requis » quand on efface le champ', async () => {
    const f = await reactive('2026-11-01');
    type(f, '');
    expect(f.componentInstance.ctrl.value).toBeNull();
    expect(f.componentInstance.ctrl.hasError('required')).toBe(true);
    expect(f.nativeElement.querySelector('mat-error')?.textContent).toContain('Date requise');
  });

  it('signale une date impossible ou un texte libre sans transmettre de valeur', async () => {
    const f = await reactive('2026-11-01');
    for (const text of ['31/02/2026', 'abc']) {
      type(f, text);
      const c = f.componentInstance.ctrl;
      expect(c.value, text).toBeNull();
      expect(c.hasError('matDatepickerParse'), text).toBe(true);
      expect(f.nativeElement.querySelector('mat-form-field').classList, text).toContain('mat-form-field-invalid');
      expect(f.nativeElement.querySelector('mat-error')?.textContent, text).toContain('Date invalide');
    }
  });

  it('signale une date au-delà du max et désactive ces jours au calendrier', async () => {
    // Frozen clock: the "today" highlight is asserted on 22/11/2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 22));
    const f = await reactive();
    type(f, '23/11/2026');
    const c = f.componentInstance.ctrl;
    expect(c.hasError('matDatepickerMax')).toBe(true);
    expect(f.nativeElement.querySelector('mat-error')?.textContent).toContain('Au plus tard le 22/11/2026');
    type(f, '22/11/2026');
    expect(c.valid).toBe(true);

    picker(f).open();
    f.detectChanges();
    await f.whenStable();
    const cell = (label: string) => document.querySelector(`.app-datepicker [aria-label="${label}"]`)?.closest('.mat-calendar-body-cell');
    expect(cell('23 novembre 2026')?.classList).toContain('mat-calendar-body-disabled');
    expect(cell('22 novembre 2026')?.classList).not.toContain('mat-calendar-body-disabled');
    expect(document.querySelector('.app-datepicker .mat-calendar-body-today')).not.toBeNull();
    picker(f).close();
  });

  it('ouvre un calendrier en français commençant le lundi', async () => {
    const f = await reactive('2026-11-01');
    picker(f).open();
    f.detectChanges();
    await f.whenStable();
    const days = [...document.querySelectorAll('.app-datepicker .mat-calendar-table-header th')].map((th) => th.textContent?.trim().toLowerCase());
    expect(days[0]).toMatch(/^l/);
    expect(document.querySelector('.app-datepicker .mat-calendar-period-button')?.textContent?.toLowerCase()).toContain('nov');
    picker(f).close();
  });

  describe('mode mois', () => {
    async function month() {
      const f = TestBed.createComponent(MonthHost);
      f.detectChanges();
      await f.whenStable();
      f.detectChanges();
      return f;
    }

    it('affiche mm/aaaa et ouvre le calendrier sur les années', async () => {
      const f = await month();
      expect(input(f).value).toBe('11/2026');
      expect(picker(f).startView).toBe('multi-year');
    });

    it('renvoie aaaa-mm au choix d’un mois et ferme le calendrier', async () => {
      const f = await month();
      const p = picker(f);
      p.open();
      f.detectChanges();
      p.monthSelected.emit(new Date(2026, 9, 1));
      f.detectChanges();
      await new Promise((r) => setTimeout(r));
      await f.whenStable();
      expect(f.componentInstance.month).toBe('2026-10');
      expect(input(f).value).toBe('10/2026');
      expect(p.opened).toBe(false);
    });

    it('accepte un mois tapé au clavier', async () => {
      const f = await month();
      type(f, '9/2026');
      await f.whenStable();
      expect(f.componentInstance.month).toBe('2026-09');
      expect(input(f).value).toBe('09/2026');
    });
  });
});
