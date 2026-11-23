import { describe, expect, it } from 'vitest';
import { MEMBER_COLUMNS, MEMBER_COLUMNS_KEY, MemberColumnId, MemberColumns } from './member-columns';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
}

const TODAY = ['code', 'lastName', 'firstName', 'phone', 'birthDate', 'sports', 'registrationDate', 'pack', 'price',
  'discount', 'status', 'balance', 'days', 'state', 'insurance', 'note'];

const ids = (c: MemberColumns) => c.visible().map((x) => x.id);
const stored = (s: MemoryStorage) => JSON.parse(s.getItem(MEMBER_COLUMNS_KEY)!);

describe('MemberColumns', () => {
  it('par défaut, État visible et Déjà payé masqué', () => {
    const c = new MemberColumns(new MemoryStorage());
    expect(ids(c)).toEqual(TODAY);
    expect(c.isVisible('paid')).toBe(false);
    expect(c.isVisible('state')).toBe(true);
    expect(c.all().length).toBe(MEMBER_COLUMNS.length);
  });

  it('déplace une colonne par indices visibles, malgré une colonne masquée entre les deux, et sauvegarde', () => {
    const s = new MemoryStorage();
    const c = new MemberColumns(s);
    c.move(3, 1); // Téléphone before Nom
    expect(ids(c).slice(0, 4)).toEqual(['code', 'phone', 'lastName', 'firstName']);
    // Statut (10) → after Reste à payer (11): hidden "paid" sits between them in the order.
    c.move(10, 11);
    expect(ids(c).slice(9, 13)).toEqual(['discount', 'balance', 'status', 'days']);
    expect(stored(s).order).toEqual(c.order());
  });

  it('ignore un déplacement sur place ou hors bornes', () => {
    const s = new MemoryStorage();
    const c = new MemberColumns(s);
    c.move(2, 2);
    c.move(0, 99);
    expect(ids(c)).toEqual(TODAY);
    expect(s.getItem(MEMBER_COLUMNS_KEY)).toBeNull();
  });

  it('masque et affiche, mais jamais l’ID', () => {
    const s = new MemoryStorage();
    const c = new MemberColumns(s);
    c.toggle('discount');
    c.toggle('paid');
    c.toggle('code');
    expect(ids(c)).not.toContain('discount');
    expect(ids(c)).toContain('paid');
    expect(ids(c)).toContain('code');
    expect(stored(s).hidden.sort()).toEqual(['discount']);
  });

  it('restaure ordre et sélection au rechargement', () => {
    const s = new MemoryStorage();
    const a = new MemberColumns(s);
    a.move(3, 1);
    a.toggle('discount');
    a.toggle('state');
    const b = new MemberColumns(s);
    expect(ids(b)).toEqual(ids(a));
    expect(b.order()).toEqual(a.order());
  });

  it('« Affichage par défaut » remet l’ordre et la sélection, et efface la sauvegarde', () => {
    const s = new MemoryStorage();
    const c = new MemberColumns(s);
    c.move(0, 5);
    c.toggle('paid');
    c.reset();
    expect(ids(c)).toEqual(TODAY);
    expect(s.getItem(MEMBER_COLUMNS_KEY)).toBeNull();
  });

  it.each([
    ['JSON invalide', '{pas du json'],
    ['valeur nulle', 'null'],
    ['mauvaise forme', '{"order": "code", "hidden": 3}'],
    ['tableau', '[1,2]'],
  ])('stockage corrompu (%s) : affichage par défaut, sans exception', (_, raw) => {
    const s = new MemoryStorage();
    s.setItem(MEMBER_COLUMNS_KEY, raw);
    expect(ids(new MemberColumns(s))).toEqual(TODAY);
  });

  it('nettoie un stockage obsolète : id inconnu ignoré, colonne absente remise à sa place par défaut', () => {
    const s = new MemoryStorage();
    // Saved before paid/state existed, with unknown ids (the former Situation column), a duplicate, and ID wrongly hidden.
    const order = ['lastName', 'code', 'ghost', ...TODAY.filter((id) => !['code', 'lastName', 'phone', 'state'].includes(id)), 'code'];
    s.setItem(MEMBER_COLUMNS_KEY, JSON.stringify({ order: [...order, 'situation'], hidden: ['discount', 'ghost', 'code', 'situation'] }));
    const c = new MemberColumns(s);
    expect(c.order()).toEqual(['lastName', 'code', 'firstName', 'phone', 'birthDate', 'sports', 'registrationDate', 'pack', 'price',
      'discount', 'status', 'paid', 'balance', 'days', 'state', 'insurance', 'note'] as MemberColumnId[]);
    expect([...c.hidden()].sort()).toEqual(['discount', 'paid']);
  });

  it('une colonne nouvelle absente du stockage prend sa visibilité par défaut', () => {
    const s = new MemoryStorage();
    s.setItem(MEMBER_COLUMNS_KEY, JSON.stringify({ order: TODAY, hidden: [] }));
    const c = new MemberColumns(s);
    expect(c.isVisible('paid')).toBe(false);
    expect(ids(c)).toEqual(TODAY);
  });

  it('fonctionne sans stockage disponible', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    const c = new MemberColumns(broken);
    expect(() => { c.toggle('paid'); c.move(0, 1); c.reset(); }).not.toThrow();
    expect(ids(c)).toEqual(TODAY);
  });
});
