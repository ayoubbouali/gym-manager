import { computed, signal } from '@angular/core';
import { moveItemInArray } from '@angular/cdk/drag-drop';

export type MemberColumnId =
  | 'code' | 'lastName' | 'firstName' | 'phone' | 'birthDate' | 'sports' | 'registrationDate' | 'pack' | 'price'
  | 'discount' | 'status' | 'balance' | 'days' | 'insurance' | 'note' | 'paid' | 'situation';

export interface MemberColumn {
  id: MemberColumnId;
  label: string;
  /** Key in the page's TableState sort map; absent when the column is not sortable. */
  sort?: string;
  num?: boolean;
  defaultVisible: boolean;
  hideable: boolean;
}

/** Default order. The Actions column is not part of it: it always stays last. */
export const MEMBER_COLUMNS: readonly MemberColumn[] = [
  // ID carries the link to the member card and the preview card, so it can move but never be hidden.
  { id: 'code', label: 'ID', sort: 'code', defaultVisible: true, hideable: false },
  { id: 'lastName', label: 'Nom', sort: 'lastName', defaultVisible: true, hideable: true },
  { id: 'firstName', label: 'Prénom', sort: 'firstName', defaultVisible: true, hideable: true },
  { id: 'phone', label: 'Téléphone', defaultVisible: true, hideable: true },
  { id: 'birthDate', label: 'Naissance', sort: 'birthDate', defaultVisible: true, hideable: true },
  { id: 'sports', label: 'Sport(s)', defaultVisible: true, hideable: true },
  { id: 'registrationDate', label: 'Inscription', sort: 'registrationDate', defaultVisible: true, hideable: true },
  { id: 'pack', label: 'Abonnement', sort: 'pack', defaultVisible: true, hideable: true },
  { id: 'price', label: 'Prix', sort: 'price', num: true, defaultVisible: true, hideable: true },
  { id: 'discount', label: 'Remise', defaultVisible: true, hideable: true },
  { id: 'status', label: 'Statut', sort: 'status', defaultVisible: true, hideable: true },
  { id: 'paid', label: 'Déjà payé', sort: 'paid', num: true, defaultVisible: false, hideable: true },
  { id: 'balance', label: 'Reste à payer', sort: 'balance', num: true, defaultVisible: true, hideable: true },
  { id: 'days', label: 'Reste jours', sort: 'days', defaultVisible: true, hideable: true },
  { id: 'situation', label: 'Situation', sort: 'situation', defaultVisible: false, hideable: true },
  { id: 'insurance', label: 'Assurance', sort: 'insurance', defaultVisible: true, hideable: true },
  { id: 'note', label: 'Note', defaultVisible: true, hideable: true },
];

export const MEMBER_COLUMNS_KEY = 'gm-members-columns';

const BY_ID = new Map(MEMBER_COLUMNS.map((c) => [c.id as string, c]));
const DEFAULT_ORDER = MEMBER_COLUMNS.map((c) => c.id);
const DEFAULT_HIDDEN = MEMBER_COLUMNS.filter((c) => !c.defaultVisible).map((c) => c.id);

interface Stored { order: MemberColumnId[]; hidden: MemberColumnId[]; }

/** Column order and visibility of the members table, remembered in this browser. */
export class MemberColumns {
  readonly order = signal<MemberColumnId[]>(DEFAULT_ORDER);
  readonly hidden = signal<ReadonlySet<MemberColumnId>>(new Set(DEFAULT_HIDDEN));
  /** Every column in the current order, for the "Colonnes" menu. */
  readonly all = computed(() => this.order().map((id) => BY_ID.get(id)!));
  readonly visible = computed(() => this.all().filter((c) => !this.hidden().has(c.id)));

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = safeLocalStorage()) {
    const stored = this.read();
    if (stored) {
      this.order.set(stored.order);
      this.hidden.set(new Set(stored.hidden));
    }
  }

  isVisible(id: MemberColumnId): boolean {
    return !this.hidden().has(id);
  }

  /** Indexes are positions among the visible columns (as reported by the header drop list). */
  move(fromVisible: number, toVisible: number): void {
    const visible = this.visible();
    if (fromVisible === toVisible || !visible[fromVisible] || !visible[toVisible]) return;
    // Hidden columns sit between visible ones in the order: translate before moving.
    const order = [...this.order()];
    moveItemInArray(order, order.indexOf(visible[fromVisible].id), order.indexOf(visible[toVisible].id));
    this.order.set(order);
    this.save();
  }

  toggle(id: MemberColumnId): void {
    if (!BY_ID.get(id)?.hideable) return;
    const hidden = new Set(this.hidden());
    if (!hidden.delete(id)) hidden.add(id);
    this.hidden.set(hidden);
    this.save();
  }

  reset(): void {
    this.order.set(DEFAULT_ORDER);
    this.hidden.set(new Set(DEFAULT_HIDDEN));
    try {
      this.storage?.removeItem(MEMBER_COLUMNS_KEY);
    } catch { /* storage unavailable: nothing to clear */ }
  }

  private save(): void {
    const value: Stored = { order: this.order(), hidden: [...this.hidden()] };
    try {
      this.storage?.setItem(MEMBER_COLUMNS_KEY, JSON.stringify(value));
    } catch { /* storage full or unavailable: the choice only lasts for this page */ }
  }

  /** Tolerant read: unknown ids are dropped, columns missing from the saved order get their default place and visibility. */
  private read(): Stored | null {
    let raw: unknown;
    try {
      const text = this.storage?.getItem(MEMBER_COLUMNS_KEY);
      if (!text) return null;
      raw = JSON.parse(text);
    } catch {
      return null;
    }
    if (!raw || typeof raw !== 'object') return null;
    const { order: rawOrder, hidden: rawHidden } = raw as Record<string, unknown>;
    const known = (v: unknown): v is MemberColumnId => typeof v === 'string' && BY_ID.has(v);
    const order = [...new Set(Array.isArray(rawOrder) ? rawOrder.filter(known) : [])];
    const saved = new Set(order);
    DEFAULT_ORDER.forEach((id, i) => {
      if (saved.has(id)) return;
      // Insert right after the closest preceding column of the default order.
      const prev = DEFAULT_ORDER.slice(0, i).reverse().find((p) => order.includes(p));
      order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id);
    });
    const hidden = (Array.isArray(rawHidden) ? rawHidden.filter(known) : []).filter((id) => saved.has(id) && BY_ID.get(id)!.hideable);
    hidden.push(...DEFAULT_HIDDEN.filter((id) => !saved.has(id)));
    return { order, hidden: [...new Set(hidden)] };
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
