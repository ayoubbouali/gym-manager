import { describe, expect, it } from 'vitest';
import { DAY_FORMAT, FrDateAdapter, MONTH_FORMAT, dateToIso, isoToDate } from './date-adapter';
import { TestBed } from '@angular/core/testing';
import { MAT_DATE_LOCALE } from '@angular/material/core';

function adapter(): FrDateAdapter {
  TestBed.configureTestingModule({ providers: [FrDateAdapter, { provide: MAT_DATE_LOCALE, useValue: 'fr-FR' }] });
  return TestBed.inject(FrDateAdapter);
}

describe('adaptateur de dates français', () => {
  it('lit jj/mm/aaaa, j/m/aaaa et les séparateurs / - .', () => {
    const a = adapter();
    for (const text of ['05/01/2026', '5/1/2026', '5-1-2026', '05.01.2026', ' 5/01/2026 ']) {
      expect(dateToIso(a.parse(text, DAY_FORMAT)), text).toBe('2026-01-05');
    }
  });

  it('refuse une date impossible ou un texte libre sans lever d’exception', () => {
    const a = adapter();
    for (const text of ['31/02/2026', '00/01/2026', '12/13/2026', 'abc', '1/1/26']) {
      const d = a.parse(text, DAY_FORMAT);
      expect(d, text).not.toBeNull();
      expect(a.isValid(d!), text).toBe(false);
    }
  });

  it('renvoie null pour un champ vide', () => {
    expect(adapter().parse('  ', DAY_FORMAT)).toBeNull();
  });

  it('affiche jj/mm/aaaa et mm/aaaa', () => {
    const a = adapter();
    expect(a.format(new Date(2026, 0, 5), DAY_FORMAT)).toBe('05/01/2026');
    expect(a.format(new Date(2026, 9, 1), MONTH_FORMAT)).toBe('10/2026');
  });

  it('lit un mois mm/aaaa', () => {
    expect(dateToIso(adapter().parse('10/2026', MONTH_FORMAT), true)).toBe('2026-10');
  });

  it('commence la semaine le lundi', () => {
    expect(adapter().getFirstDayOfWeek()).toBe(1);
  });

  it('convertit ISO ⇄ date locale sans décalage de fuseau', () => {
    const d = isoToDate('2026-11-01')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 1]);
    expect(dateToIso(d)).toBe('2026-11-01');
    expect(dateToIso(isoToDate('2026-10'), true)).toBe('2026-10');
    expect(isoToDate('2026-02-31')).toBeNull();
    expect(isoToDate('')).toBeNull();
    expect(dateToIso(adapter().deserialize('2026-11-01'))).toBe('2026-11-01');
  });
});
