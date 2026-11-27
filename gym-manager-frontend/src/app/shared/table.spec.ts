import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { Paged, TableState } from './table';

interface Row { code: string; name: string; price: number; active: boolean; }

const rows: Row[] = [
  { code: 'A001', name: 'Alaoui', price: 450, active: true },
  { code: 'A002', name: 'Élodie', price: 675, active: false },
  { code: 'A003', name: 'Idrissi', price: 3213, active: true },
];

function table(pageSize = 20) {
  const t = new TableState<Row>({
    searchText: (r) => `${r.code} ${r.name}`,
    sort: { code: (r) => r.code, price: (r) => r.price },
    defaultSort: { key: 'code', dir: 'asc' },
    isActive: (r) => r.active,
    pageSize: signal(pageSize),
  });
  t.rows.set(rows);
  return t;
}

describe('TableState', () => {
  it('masque les inactifs par défaut', () => {
    const t = table();
    expect(t.filtered().map((r) => r.code)).toEqual(['A001', 'A003']);
    t.showInactive.set(true);
    expect(t.filtered()).toHaveLength(3);
  });

  it('recherche sans accents', () => {
    const t = table();
    t.showInactive.set(true);
    t.setSearch('elodie');
    expect(t.filtered().map((r) => r.code)).toEqual(['A002']);
  });

  it('tri par colonne, ascendant puis descendant', () => {
    const t = table();
    t.toggleSort('price');
    expect(t.filtered().map((r) => r.price)).toEqual([450, 3213]);
    t.toggleSort('price');
    expect(t.filtered().map((r) => r.price)).toEqual([3213, 450]);
    expect(t.ariaSort('price')).toBe('descending');
  });

  it('pagination', () => {
    const t = table(1);
    expect(t.pageCount()).toBe(2);
    expect(t.page().map((r) => r.code)).toEqual(['A001']);
    t.pageIndex.set(1);
    expect(t.page().map((r) => r.code)).toEqual(['A003']);
  });
});

describe('Paged', () => {
  it('découpe la liste en pages et revient à la première quand la liste change', () => {
    const list = signal(Array.from({ length: 25 }, (_, i) => i));
    const p = new Paged(() => list(), 10);
    expect(p.pageCount()).toBe(3);
    expect(p.page()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    p.pageIndex.set(2);
    expect(p.page()).toEqual([20, 21, 22, 23, 24]);
    list.set([1, 2, 3]);
    expect(p.pageIndex()).toBe(0);
    expect(p.pageCount()).toBe(1);
    expect(p.page()).toEqual([1, 2, 3]);
  });

  it('suit une taille de page variable', () => {
    const size = signal(2);
    const p = new Paged(() => [1, 2, 3, 4, 5], () => size());
    expect(p.pageCount()).toBe(3);
    size.set(5);
    expect(p.pageCount()).toBe(1);
  });
});
