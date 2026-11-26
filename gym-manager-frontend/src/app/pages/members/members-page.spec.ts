import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CdkConnectedOverlay } from '@angular/cdk/overlay';
import { CdkDropList } from '@angular/cdk/drag-drop';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';
import { LucideAngularModule } from 'lucide-angular';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { APP_ICONS } from '../../core/icons';
import { MemberView } from '../../core/models';
import { MEMBER_COLUMNS_KEY } from './member-columns';
import { MembersPage, PREVIEW_DELAY_MS, PREVIEW_ID } from './members-page';

function member(id: number, over: Partial<MemberView> = {}): MemberView {
  return {
    id, code: `A00${id}`, lastName: `Nom${id}`, firstName: `Prenom${id}`, phone: '0600000000', birthDate: null,
    registrationDate: '2026-11-01', sportIds: [1], sports: [], subscriptionId: id, periodStart: '2026-11-01', periodCount: 1,
    packId: 1, pack: { id: 1, name: 'Pack' }, discountId: 1, discount: { name: 'Aucune' }, insurance: 'PAYE', hasPhoto: false,
    notes: '', active: true, activityIds: [], price: 100, endDate: '2026-12-01', remainingDays: 9, paid: 100, balance: 0,
    paymentStatus: 'PAYE', activeMember: true, situation: 'OK', state: 'UP_TO_DATE',
    ...over,
  } as unknown as MemberView;
}

const rows = [
  member(1, { notes: 'Allergie\nau pollen' }),
  member(2, { notes: '   ', paymentStatus: 'IMPAYE' } as Partial<MemberView>),
  member(3, { active: false }),
];

describe('page Adhérents', () => {
  let api: { members: ReturnType<typeof vi.fn>; sports: ReturnType<typeof vi.fn>; packs: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };

  async function render() {
    const fixture = TestBed.createComponent(MembersPage);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    localStorage.removeItem(MEMBER_COLUMNS_KEY);
    api = { members: vi.fn().mockResolvedValue(rows), sports: vi.fn().mockResolvedValue([]), packs: vi.fn().mockResolvedValue([]) };
    dialog = { open: vi.fn() };
    TestBed.configureTestingModule({
      imports: [MembersPage],
      providers: [
        provideRouter([]),
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: ConfigService, useValue: { pageSize: signal(20), currency: signal('DH'), config: signal(null) } },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: dialog });
  });

  it('la pastille du total suit les filtres, avec « sur » quand la liste est restreinte', async () => {
    const f = await render();
    const page = f.componentInstance;
    const pill = () => f.nativeElement.querySelector('.toolbar .count-pill');
    expect(page.count()).toBe('2 adhérents');
    f.detectChanges();
    expect(pill().querySelector('.count-pill-num').textContent.trim()).toBe('2');
    expect(pill().querySelector('.count-pill-of')).toBeNull();
    page.fStatus.set('IMPAYE');
    expect(page.count()).toBe('1 sur 2 adhérents');
    f.detectChanges();
    expect([...pill().querySelectorAll('[aria-hidden="true"]:not(lucide-icon)')].map((e: Element) => e.textContent!.trim())).toEqual(['1', 'sur 2', 'adhérents']);
    expect(pill().querySelector('.sr-only').textContent.trim()).toBe('1 sur 2 adhérents');
    page.t.setSearch('introuvable');
    expect(page.count()).toBe('0 sur 2 adhérents');
    page.t.setSearch('');
    page.fStatus.set(null);
    page.t.showInactive.set(true);
    expect(page.count()).toBe('3 adhérents');
    expect(f.nativeElement.querySelector('.toolbar').firstElementChild).toBe(pill());
    expect(f.nativeElement.querySelector('.filters-count')).toBeNull();
  });

  it('le total s’accorde au singulier', async () => {
    api.members.mockResolvedValue([rows[0]]);
    const f = await render();
    expect(f.componentInstance.count()).toBe('1 adhérent');
    expect(f.nativeElement.querySelector('.count-pill-unit').textContent.trim()).toBe('adhérent');
  });

  it('les filtres sont Sport, Statut, État, Assurance puis « Avec une note », sans Pack', async () => {
    const f = await render();
    const labels = [...f.nativeElement.querySelectorAll('.filters mat-label, .filters mat-slide-toggle')]
      .map((e) => (e as HTMLElement).textContent!.trim());
    expect(labels).toEqual(['Sport', 'Statut', 'État', 'Assurance', 'Avec une note', 'Afficher les inactifs']);
    expect(api.packs).not.toHaveBeenCalled();
  });

  it('« Avec une note » ne garde que les adhérents dont la note n’est pas vide, et compte comme un filtre', async () => {
    const f = await render();
    const page = f.componentInstance;
    page.t.showInactive.set(true);
    page.fNote.set(true);
    expect(page.t.filtered().map((m) => m.code)).toEqual(['A001']);
    expect(page.activeFilters()).toBe(2);
  });

  it('le filtre État ne garde que les adhérents dans l’état choisi', async () => {
    api.members.mockResolvedValue([member(1), member(2, { state: 'EXPIRED' }), member(3, { state: 'EXPIRED' })]);
    const f = await render();
    const page = f.componentInstance;
    page.fState.set('EXPIRED');
    expect(page.t.filtered().map((m) => m.id)).toEqual([2, 3]);
    expect(page.count()).toBe('2 sur 3 adhérents');
    expect(page.activeFilters()).toBe(1);
    expect(page.states.map((s) => s.label)).toEqual(['Expiré', 'En attente de paiement', 'Expire bientôt', 'À jour', 'Sans abonnement']);
  });

  it('Réinitialiser remet tous les filtres à l’état initial sans toucher au tri', async () => {
    const f = await render();
    const page = f.componentInstance;
    expect(page.filtersAtDefault()).toBe(true);
    page.t.toggleSort('price');
    page.fSport.set(1); page.fStatus.set('PAYE'); page.fState.set('UP_TO_DATE'); page.fInsurance.set('IMPAYE'); page.fNote.set(true);
    page.t.showInactive.set(true); page.t.setSearch('nom'); page.t.pageIndex.set(2);
    expect(page.filtersAtDefault()).toBe(false);

    page.resetFilters();

    expect([page.fSport(), page.fStatus(), page.fState(), page.fInsurance(), page.fNote()]).toEqual([null, null, null, null, false]);
    expect(page.t.showInactive()).toBe(false);
    expect(page.t.search()).toBe('');
    expect(page.t.pageIndex()).toBe(0);
    expect(page.t.sortKey()).toBe('price');
    expect(page.filtersAtDefault()).toBe(true);
    expect(page.count()).toBe('2 adhérents');
  });

  it('l’icône Réinitialiser n’apparaît qu’avec un filtre actif, au bout de la ligne des filtres, avec le nombre de filtres', async () => {
    const f = await render();
    const page = f.componentInstance;
    const reset = () => f.nativeElement.querySelector('.filters .reset-fab') as HTMLButtonElement | null;
    expect(reset()).toBeNull();
    page.fStatus.set('PAYE');
    f.detectChanges();
    expect(reset()).not.toBeNull();
    expect(reset()!.querySelector('.reset-badge')!.textContent!.trim()).toBe('1');
    expect(reset()!.getAttribute('aria-label')).toBe('Réinitialiser les filtres');
    expect(f.nativeElement.querySelector('.filters').lastElementChild).toBe(reset());
    page.t.setSearch('nom'); page.t.showInactive.set(true);
    f.detectChanges();
    expect(reset()!.querySelector('.reset-badge')!.textContent!.trim()).toBe('3');
    reset()!.click();
    f.detectChanges();
    await f.whenStable();
    expect(page.filtersAtDefault()).toBe(true);
    expect(reset()).toBeNull();
    expect(document.activeElement).toBe(f.nativeElement.querySelector('.search input'));
  });

  it('l’icône Note n’apparaît que si la note existe, avec la note en infobulle', async () => {
    const f = await render();
    const icons = f.debugElement.queryAll(By.css('button[aria-label^="Note de"]'));
    expect(icons.map((b) => b.nativeElement.getAttribute('aria-label'))).toEqual(['Note de A001']);
    const tooltip = icons[0].injector.get(MatTooltip);
    expect(tooltip.message).toBe('Allergie\nau pollen');
    expect(tooltip.tooltipClass).toBe('note-tooltip');
  });

  it('le clic sur l’icône ouvre la popup et recharge la liste après enregistrement', async () => {
    const f = await render();
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    api.members.mockClear();
    f.nativeElement.querySelector('button[aria-label="Note de A001"]').click();
    await f.whenStable();
    expect(dialog.open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ data: rows[0] }));
    expect(api.members).toHaveBeenCalledTimes(1);
  });
  describe('colonnes personnalisables', () => {
    type Fixture = Awaited<ReturnType<typeof render>>;
    const headers = (f: Fixture) => [...f.nativeElement.querySelectorAll('thead th')].map((th) => (th as HTMLElement).textContent!.trim());
    const firstRow = (f: Fixture) => [...f.nativeElement.querySelectorAll('tbody tr:first-child td')].map((td) => (td as HTMLElement).textContent!.trim());
    const drop = (f: Fixture, previousIndex: number, currentIndex: number) => {
      const list = f.debugElement.query(By.directive(CdkDropList)).injector.get(CdkDropList);
      list.dropped.emit({ previousIndex, currentIndex } as never);
      f.detectChanges();
    };
    const trigger = (f: Fixture) => f.nativeElement.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    const openMenu = (f: Fixture) => {
      if (trigger(f).getAttribute('aria-expanded') !== 'true') trigger(f).click();
      f.detectChanges();
      return [...document.querySelectorAll('.columns-menu [role="menuitemcheckbox"]')] as HTMLButtonElement[];
    };
    const TODAY = ['ID', 'Nom', 'Prénom', 'Téléphone', 'Naissance', 'Sport(s)', 'Inscription', 'Abonnement', 'Prix', 'Remise', 'Statut',
      'Reste à payer', 'Reste jours', 'État', 'Assurance', 'Note', 'Actions'];

    it('par défaut, les colonnes et leur ordre sont ceux du tableau actuel', async () => {
      const f = await render();
      expect(headers(f)).toEqual(TODAY);
      expect(f.nativeElement.querySelectorAll('thead th[cdkdrag], thead th.cdk-drag').length).toBe(16);
    });

    it('déposer Téléphone avant Nom déplace l’en-tête et les cellules de toutes les lignes, et sauvegarde', async () => {
      const f = await render();
      drop(f, 3, 1);
      expect(headers(f).slice(0, 4)).toEqual(['ID', 'Téléphone', 'Nom', 'Prénom']);
      expect(firstRow(f).slice(0, 4)).toEqual(['A001', '0600000000', 'Nom1', 'Prenom1']);
      for (const tr of f.nativeElement.querySelectorAll('tbody tr')) {
        expect((tr as HTMLElement).children[1].textContent!.trim()).toBe('0600000000');
      }
      expect(JSON.parse(localStorage.getItem(MEMBER_COLUMNS_KEY)!).order.slice(0, 3)).toEqual(['code', 'phone', 'lastName']);
    });

    it('un simple clic sur un en-tête trie sans déplacer la colonne', async () => {
      const f = await render();
      const price = [...f.nativeElement.querySelectorAll('thead th')].find((th) => (th as HTMLElement).textContent!.trim() === 'Prix') as HTMLElement;
      price.querySelector('button')!.click();
      f.detectChanges();
      expect(f.componentInstance.t.sortKey()).toBe('price');
      expect(price.getAttribute('aria-sort')).toBe('ascending');
      expect(headers(f)).toEqual(TODAY);
      expect(localStorage.getItem(MEMBER_COLUMNS_KEY)).toBeNull();
    });

    it('le menu « Colonnes » masque Remise, affiche Déjà payé, et ne permet pas de masquer l’ID', async () => {
      const f = await render();
      const items = openMenu(f);
      expect(items.map((b) => b.textContent!.trim())).toEqual(f.componentInstance.cols.all().map((c) => c.label));
      const item = (label: string) => openMenu(f).find((b) => b.textContent!.trim() === label)!;
      expect(item('ID').disabled).toBe(true);
      expect(item('Remise').getAttribute('aria-checked')).toBe('true');
      item('Remise').click();
      f.detectChanges();
      // Ticking a box keeps the menu open so several columns can be changed in a row.
      expect(trigger(f).getAttribute('aria-expanded')).toBe('true');
      item('Déjà payé').click();
      f.detectChanges();
      expect(headers(f)).not.toContain('Remise');
      expect(headers(f)).toContain('Déjà payé');
      expect(item('Remise').getAttribute('aria-checked')).toBe('false');
      expect(firstRow(f)[headers(f).indexOf('Déjà payé')]).toContain('100');
      item('ID').click();
      f.detectChanges();
      expect(headers(f)[0]).toBe('ID');
      expect(JSON.parse(localStorage.getItem(MEMBER_COLUMNS_KEY)!).hidden.sort()).toEqual(['discount']);
    });

    it('la colonne État, visible par défaut, affiche le détail et se trie par urgence, Déjà payé par montant', async () => {
      // Alphabetical order of the codes differs from the urgency order.
      api.members.mockResolvedValue([
        member(1, { state: 'UP_TO_DATE', balance: 0, paid: 50 }), member(2, { state: 'UP_TO_DATE', balance: 150, paid: 300 }),
        member(3, { state: 'SOON', remainingDays: 3, paid: 0 }), member(4, { state: 'EXPIRED', remainingDays: -12, paid: 120 }),
        member(5, { state: 'NONE', paid: 10 }), member(6, { state: 'UNPAID', balance: 300, paid: 5 }),
      ]);
      const f = await render();
      const page = f.componentInstance;
      const cell = (code: string) => {
        const row = [...f.nativeElement.querySelectorAll('tbody tr')].find((r) => (r as HTMLElement).textContent!.includes(code)) as HTMLElement;
        return [...row.querySelector('app-state-badge')!.children].map((e) => e.textContent!.trim()).join(' ');
      };
      expect(cell('A001')).toBe('À jour');
      expect(cell('A002')).toBe('À jour reste 150,00 DH');
      expect(cell('A003')).toBe('Expire bientôt J-3');
      expect(cell('A004')).toBe('Expiré depuis 12 j');
      expect(cell('A006')).toBe('En attente de paiement reste 300,00 DH');
      page.t.toggleSort('state');
      expect(page.t.filtered().map((m) => m.id)).toEqual([4, 6, 3, 2, 1, 5]);
      page.t.toggleSort('paid');
      expect(page.t.filtered().map((m) => m.paid)).toEqual([0, 5, 10, 50, 120, 300]);
    });

    it('masquer la colonne triée remet le tri par défaut (ID croissant)', async () => {
      const f = await render();
      const page = f.componentInstance;
      page.t.toggleSort('price');
      page.t.toggleSort('price');
      openMenu(f).find((b) => b.textContent!.trim() === 'Prix')!.click();
      f.detectChanges();
      expect([page.t.sortKey(), page.t.sortDir()]).toEqual(['code', 'asc']);
      expect(f.nativeElement.querySelector('thead th[aria-sort="ascending"]').textContent.trim()).toBe('ID');
    });

    it('« Affichage par défaut » remet le tri par défaut si la colonne triée est masquée', async () => {
      const f = await render();
      const page = f.componentInstance;
      page.toggleColumn('paid');
      page.t.toggleSort('paid');
      page.resetColumns();
      expect([page.t.sortKey(), page.t.sortDir()]).toEqual(['code', 'asc']);
    });

    it('les préférences sauvegardées sont restaurées au rechargement', async () => {
      const a = await render();
      drop(a, 3, 1);
      a.componentInstance.cols.toggle('discount');
      a.destroy();
      const b = await render();
      expect(headers(b).slice(0, 3)).toEqual(['ID', 'Téléphone', 'Nom']);
      expect(headers(b)).not.toContain('Remise');
    });

    it('un stockage corrompu donne l’affichage par défaut sans erreur', async () => {
      localStorage.setItem(MEMBER_COLUMNS_KEY, '{pas du json');
      const f = await render();
      expect(headers(f)).toEqual(TODAY);
    });

    it('« Affichage par défaut » remet les colonnes et efface la sauvegarde', async () => {
      const f = await render();
      drop(f, 0, 4);
      f.componentInstance.toggleColumn('paid');
      openMenu(f);
      const reset = [...document.querySelectorAll('.columns-menu [mat-menu-item]')].find((b) => b.textContent!.includes('Affichage par défaut')) as HTMLButtonElement;
      reset.click();
      f.detectChanges();
      expect(headers(f)).toEqual(TODAY);
      expect(localStorage.getItem(MEMBER_COLUMNS_KEY)).toBeNull();
    });

    it('la ligne vide couvre les colonnes visibles plus Actions', async () => {
      api.members.mockResolvedValue([]);
      const f = await render();
      const colspan = () => f.nativeElement.querySelector('td.empty').getAttribute('colspan');
      expect(colspan()).toBe('17');
      f.componentInstance.cols.toggle('discount');
      f.componentInstance.cols.toggle('note');
      f.detectChanges();
      expect(colspan()).toBe('15');
    });

    it('la carte d’aperçu fonctionne toujours quand l’ID est déplacé', async () => {
      const f = await render();
      drop(f, 0, 5);
      vi.useFakeTimers();
      try {
        const a = f.nativeElement.querySelector('a.code-link') as HTMLAnchorElement;
        expect(a.closest('td')!.cellIndex).toBe(5);
        a.dispatchEvent(new MouseEvent('mouseenter'));
        vi.advanceTimersByTime(PREVIEW_DELAY_MS);
        f.detectChanges();
        expect(document.getElementById(PREVIEW_ID)).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('carte d’aperçu au survol de l’ID', () => {
    const card = () => document.getElementById(PREVIEW_ID);
    const link = (f: Awaited<ReturnType<typeof render>>, code = 'A001') =>
      [...f.nativeElement.querySelectorAll('a.code-link')].find((a) => (a as HTMLElement).textContent!.trim() === code) as HTMLAnchorElement;
    const settle = (f: Awaited<ReturnType<typeof render>>, ms: number) => { vi.advanceTimersByTime(ms); f.detectChanges(); };

    afterEach(() => vi.useRealTimers());

    it('s’ouvre après le délai de survol, liée au lien, puis se ferme quand la souris quitte le lien', async () => {
      const f = await render();
      vi.useFakeTimers();
      const a = link(f);
      a.dispatchEvent(new MouseEvent('mouseenter'));
      settle(f, PREVIEW_DELAY_MS - 1);
      expect(card()).toBeNull();
      settle(f, 1);
      expect(card()).not.toBeNull();
      expect(card()!.textContent).toContain('Nom1 Prenom1');
      expect(a.getAttribute('aria-describedby')).toBe(PREVIEW_ID);
      expect(link(f, 'A002').hasAttribute('aria-describedby')).toBe(false);
      a.dispatchEvent(new MouseEvent('mouseleave'));
      f.detectChanges();
      expect(card()).toBeNull();
      expect(a.hasAttribute('aria-describedby')).toBe(false);
    });

    it('ne s’ouvre pas quand la souris ne fait que traverser l’ID', async () => {
      const f = await render();
      vi.useFakeTimers();
      const a = link(f);
      a.dispatchEvent(new MouseEvent('mouseenter'));
      settle(f, PREVIEW_DELAY_MS / 2);
      a.dispatchEvent(new MouseEvent('mouseleave'));
      settle(f, PREVIEW_DELAY_MS * 2);
      expect(card()).toBeNull();
    });

    it('s’ouvre immédiatement au focus clavier et se ferme au blur', async () => {
      const f = await render();
      vi.useFakeTimers();
      const a = link(f);
      a.focus();
      f.detectChanges();
      expect(card()).not.toBeNull();
      expect(a.getAttribute('aria-describedby')).toBe(PREVIEW_ID);
      a.blur();
      f.detectChanges();
      expect(card()).toBeNull();
    });

    it('se ferme sur Échap', async () => {
      const f = await render();
      vi.useFakeTimers();
      const a = link(f);
      a.focus();
      settle(f, PREVIEW_DELAY_MS);
      expect(card()).not.toBeNull();
      a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true } as KeyboardEventInit));
      f.detectChanges();
      expect(card()).toBeNull();
      expect(f.componentInstance.preview()).toBeNull();
      expect(a.hasAttribute('aria-describedby')).toBe(false);
      expect(document.activeElement).toBe(a);
    });

    it('Échap avant la fin du délai annule l’ouverture', async () => {
      const f = await render();
      vi.useFakeTimers();
      const a = link(f);
      a.dispatchEvent(new MouseEvent('mouseenter'));
      settle(f, PREVIEW_DELAY_MS / 2);
      a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      settle(f, PREVIEW_DELAY_MS * 2);
      expect(card()).toBeNull();
      expect(f.componentInstance.preview()).toBeNull();
    });

    it('configure le repositionnement de la carte (droite, gauche, dessous, dessus, push, marge 8 px)', async () => {
      const f = await render();
      vi.useFakeTimers();
      link(f).dispatchEvent(new MouseEvent('mouseenter'));
      settle(f, PREVIEW_DELAY_MS);
      // mat-select also renders a cdkConnectedOverlay: pick the one anchored to the ID link.
      const overlay = f.debugElement.queryAllNodes(By.directive(CdkConnectedOverlay))
        .map((n) => n.injector.get(CdkConnectedOverlay)).find((o) => o.origin === link(f))!;
      expect(overlay.positions.map((p) => [p.overlayX, p.overlayY])).toEqual([['start', 'center'], ['end', 'center'], ['start', 'top'], ['start', 'bottom']]);
      expect(overlay.push).toBe(true);
      expect(overlay.viewportMargin).toBe(8);
    });

    it('passe d’un adhérent à l’autre sans garder l’ancienne carte', async () => {
      const f = await render();
      vi.useFakeTimers();
      link(f).dispatchEvent(new MouseEvent('mouseenter'));
      settle(f, PREVIEW_DELAY_MS);
      link(f).dispatchEvent(new MouseEvent('mouseleave'));
      link(f, 'A002').dispatchEvent(new MouseEvent('mouseenter'));
      settle(f, PREVIEW_DELAY_MS);
      expect(document.querySelectorAll('app-member-preview').length).toBe(1);
      expect(card()!.textContent).toContain('Nom2 Prenom2');
    });
  });
});
