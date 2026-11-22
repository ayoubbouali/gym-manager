import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CdkConnectedOverlay } from '@angular/cdk/overlay';
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
import { MembersPage, PREVIEW_DELAY_MS, PREVIEW_ID } from './members-page';

function member(id: number, over: Partial<MemberView> = {}): MemberView {
  return {
    id, code: `A00${id}`, lastName: `Nom${id}`, firstName: `Prenom${id}`, phone: '0600000000', birthDate: null,
    registrationDate: '2026-11-01', sportIds: [1], sports: [], subscriptionId: id, periodStart: '2026-11-01', periodCount: 1,
    packId: 1, pack: { id: 1, name: 'Pack' }, discountId: 1, discount: { name: 'Aucune' }, insurance: 'PAYE', hasPhoto: false,
    notes: '', active: true, activityIds: [], price: 100, endDate: '2026-12-01', remainingDays: 9, paid: 100, balance: 0,
    paymentStatus: 'PAYE', activeMember: true, situation: 'OK',
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

  it('les filtres sont Sport, Statut, Assurance puis « Avec une note », sans Pack', async () => {
    const f = await render();
    const labels = [...f.nativeElement.querySelectorAll('.filters mat-label, .filters mat-slide-toggle')]
      .map((e) => (e as HTMLElement).textContent!.trim());
    expect(labels).toEqual(['Sport', 'Statut', 'Assurance', 'Avec une note', 'Afficher les inactifs']);
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

  it('Réinitialiser remet tous les filtres à l’état initial sans toucher au tri', async () => {
    const f = await render();
    const page = f.componentInstance;
    expect(page.filtersAtDefault()).toBe(true);
    page.t.toggleSort('price');
    page.fSport.set(1); page.fStatus.set('PAYE'); page.fInsurance.set('IMPAYE'); page.fNote.set(true);
    page.t.showInactive.set(true); page.t.setSearch('nom'); page.t.pageIndex.set(2);
    expect(page.filtersAtDefault()).toBe(false);

    page.resetFilters();

    expect([page.fSport(), page.fStatus(), page.fInsurance(), page.fNote()]).toEqual([null, null, null, false]);
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
