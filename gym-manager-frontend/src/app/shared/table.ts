import { Component, Signal, WritableSignal, computed, input, linkedSignal, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { norm } from '../core/format';

type SortValue = string | number | boolean | null | undefined;

export interface TableOptions<T> {
  /** Text searched by the search box (case and accent insensitive). */
  searchText: (row: T) => string;
  /** Sortable columns: key → value. */
  sort: Record<string, (row: T) => SortValue>;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  /** Rows considered inactive are hidden unless "Afficher les inactifs" is on. */
  isActive?: (row: T) => boolean;
  /** Extra filters (may read signals). */
  filter?: () => (row: T) => boolean;
  pageSize: Signal<number>;
}

/** Page sizes offered by the pager; the first one is also the smallest table that shows a pager in auto mode. */
export const PAGE_SIZES = [10, 20, 50, 100];

/** What the pager reads: the rows to page through, the page size (the user may change it) and the current page. */
export interface Pageable {
  filtered: Signal<readonly unknown[]>;
  pageSize: WritableSignal<number>;
  pageCount: Signal<number>;
  pageIndex: WritableSignal<number>;
}

/** Pagination of a plain list (no search nor sort): back to the first page whenever the list changes. */
export class Paged<T> implements Pageable {
  readonly filtered: Signal<T[]>;
  readonly pageSize: WritableSignal<number>;
  readonly pageIndex: WritableSignal<number>;
  readonly pageCount: Signal<number>;
  readonly page: Signal<T[]>;

  constructor(source: () => T[], size: number | (() => number) = 10) {
    this.filtered = computed(source);
    this.pageSize = linkedSignal(typeof size === 'number' ? () => size : size);
    this.pageIndex = linkedSignal({ source: this.filtered, computation: () => 0 });
    this.pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
    this.page = computed(() => {
      const i = Math.min(this.pageIndex(), this.pageCount() - 1);
      return this.filtered().slice(i * this.pageSize(), (i + 1) * this.pageSize());
    });
  }
}

/** Client-side state of a list page: search, filters, sort, pagination. */
export class TableState<T> implements Pageable {
  readonly rows = signal<T[]>([]);
  readonly search = signal('');
  readonly showInactive = signal(false);
  readonly sortKey = signal<string | null>(null);
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly pageIndex = signal(0);

  constructor(private opts: TableOptions<T>) {
    if (opts.defaultSort) {
      this.sortKey.set(opts.defaultSort.key);
      this.sortDir.set(opts.defaultSort.dir);
    }
  }

  readonly filtered = computed(() => {
    const q = norm(this.search());
    const extra = this.opts.filter?.();
    const showInactive = this.showInactive();
    let list = this.rows().filter((r) =>
      (showInactive || !this.opts.isActive || this.opts.isActive(r)) &&
      (!q || norm(this.opts.searchText(r)).includes(q)) &&
      (!extra || extra(r)));
    const key = this.sortKey();
    const get = key ? this.opts.sort[key] : undefined;
    if (get) {
      const dir = this.sortDir() === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => compare(get(a), get(b)) * dir);
    }
    return list;
  });

  readonly pageSize = linkedSignal(() => this.opts.pageSize());
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  readonly page = computed(() => {
    const i = Math.min(this.pageIndex(), this.pageCount() - 1);
    return this.filtered().slice(i * this.pageSize(), (i + 1) * this.pageSize());
  });

  setSearch(v: string): void {
    this.search.set(v);
    this.pageIndex.set(0);
  }

  toggleSort(key: string): void {
    if (this.sortKey() === key) this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    return this.sortKey() === key ? (this.sortDir() === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  resetPage(): void {
    this.pageIndex.set(0);
  }
}

function compare(a: SortValue, b: SortValue): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return norm(String(a)).localeCompare(norm(String(b)), 'fr', { numeric: true });
}

/** Sortable column header: put inside a <th [attr.aria-sort]="t.ariaSort(key)">. */
@Component({
  selector: 'app-sort',
  imports: [LucideAngularModule],
  template: `
    <button type="button" class="th-sort" (click)="table().toggleSort(key())">
      <ng-content />
      @if (table().sortKey() === key()) {
        <lucide-icon [name]="table().sortDir() === 'asc' ? 'chevron-up' : 'chevron-down'" [size]="14" />
      } @else {
        <lucide-icon name="chevrons-up-down" [size]="14" class="faint" />
      }
    </button>
  `,
})
export class SortHeader {
  table = input.required<TableState<any>>();
  key = input.required<string>();
}

@Component({
  selector: 'app-pager',
  imports: [LucideAngularModule],
  template: `
    @if (!auto() || table().filtered().length > sizes[0]) {
    <nav class="pager" aria-label="Pagination">
      <span class="muted">{{ table().filtered().length }} ligne(s)</span>
      <label class="page-size"><span class="muted">Afficher</span>
        <select [value]="table().pageSize()" (change)="setSize(+$any($event.target).value)" aria-label="Lignes par page">
          @for (n of sizeOptions(); track n) {<option [value]="n" [selected]="n === table().pageSize()">{{ n }}</option>}
        </select>
        <span class="muted">par page</span></label>
      <span class="grow"></span>
      <button type="button" class="icon-btn" [disabled]="current() === 0" (click)="go(current() - 1)" aria-label="Page précédente">
        <lucide-icon name="chevron-left" [size]="16" />
      </button>
      @for (p of pages(); track p) {
        <button type="button" class="page-btn" [class.on]="p === current()" [attr.aria-current]="p === current() ? 'page' : null" (click)="go(p)">{{ p + 1 }}</button>
      }
      <button type="button" class="icon-btn" [disabled]="current() >= table().pageCount() - 1" (click)="go(current() + 1)" aria-label="Page suivante">
        <lucide-icon name="chevron-right" [size]="16" />
      </button>
    </nav>
    }
  `,
})
export class Pager {
  table = input.required<Pageable>();
  /** Hidden while everything fits on one page (secondary tables). */
  auto = input(false);
  readonly sizes = PAGE_SIZES;
  /** The usual sizes, plus the table's own if it is another one. */
  sizeOptions = computed(() => {
    const n = this.table().pageSize();
    return PAGE_SIZES.includes(n) ? PAGE_SIZES : [...PAGE_SIZES, n].sort((a, b) => a - b);
  });
  current = computed(() => Math.min(this.table().pageIndex(), this.table().pageCount() - 1));
  pages = computed(() => {
    const n = this.table().pageCount();
    const c = this.current();
    const start = Math.max(0, Math.min(c - 2, n - 5));
    return Array.from({ length: Math.min(5, n) }, (_, i) => start + i);
  });
  go(p: number): void {
    this.table().pageIndex.set(p);
  }
  /** Keeps the first row of the current page in view. */
  setSize(n: number): void {
    const t = this.table();
    const first = this.current() * t.pageSize();
    t.pageSize.set(n);
    t.pageIndex.set(Math.floor(first / n));
  }
}
