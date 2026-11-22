import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';
import { LucideAngularModule } from 'lucide-angular';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { APP_ICONS } from '../../core/icons';
import { MemberView } from '../../core/models';
import { MembersPage } from './members-page';

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

  it('le total suit les filtres et s’accorde au singulier', async () => {
    const f = await render();
    const page = f.componentInstance;
    expect(page.count()).toBe('2 adhérents');
    page.fStatus.set('IMPAYE');
    expect(page.count()).toBe('1 adhérent');
    page.t.setSearch('introuvable');
    expect(page.count()).toBe('0 adhérent');
    page.t.setSearch('');
    page.fStatus.set(null);
    page.t.showInactive.set(true);
    expect(page.count()).toBe('3 adhérents');
    f.detectChanges();
    expect(f.nativeElement.querySelector('.filters-count').textContent.trim()).toBe('3 adhérents');
  });

  it('Réinitialiser remet tous les filtres à l’état initial sans toucher au tri', async () => {
    const f = await render();
    const page = f.componentInstance;
    expect(page.filtersAtDefault()).toBe(true);
    page.t.toggleSort('price');
    page.fSport.set(1); page.fPack.set(1); page.fStatus.set('PAYE'); page.fInsurance.set('IMPAYE');
    page.t.showInactive.set(true); page.t.setSearch('nom'); page.t.pageIndex.set(2);
    expect(page.filtersAtDefault()).toBe(false);

    page.resetFilters();

    expect([page.fSport(), page.fPack(), page.fStatus(), page.fInsurance()]).toEqual([null, null, null, null]);
    expect(page.t.showInactive()).toBe(false);
    expect(page.t.search()).toBe('');
    expect(page.t.pageIndex()).toBe(0);
    expect(page.t.sortKey()).toBe('price');
    expect(page.filtersAtDefault()).toBe(true);
    expect(page.count()).toBe('2 adhérents');
  });

  it('le bouton Réinitialiser est grisé à l’état initial', async () => {
    const f = await render();
    const button = () => [...f.nativeElement.querySelectorAll('.filters button')].find((b: HTMLButtonElement) => b.textContent!.includes('Réinitialiser')) as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    f.componentInstance.fPack.set(1);
    f.detectChanges();
    expect(button().disabled).toBe(false);
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
});
