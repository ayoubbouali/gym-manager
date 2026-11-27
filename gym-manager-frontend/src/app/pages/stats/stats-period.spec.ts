import { Type, importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { provideFrDates } from '../../core/date-adapter';
import { APP_ICONS } from '../../core/icons';
import { ClubStats } from './stats-page';
import { StaffPayStats } from './staff-pay-stats';
import { ChargeStats } from './charge-stats';
import { RegistrationStats } from './registration-stats';

describe('Statistiques : période par défaut', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    // never resolved: only the request matters, the template is not rendered
    const pending = () => vi.fn(() => new Promise(() => {}));
    api = { stats: pending(), payrollStats: pending(), registrationStats: pending(), chargeStats: pending(), staffOptions: vi.fn().mockResolvedValue([]) };
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: ConfigService, useValue: { config: signal({ today: '2026-11-26' }), currency: signal('DH') } },
      ],
    });
  });

  it('Club : « Période personnalisée » du 1er du mois en cours à aujourd’hui', () => {
    const page = TestBed.createComponent(ClubStats).componentInstance;
    expect(page.period()).toBe('CUSTOM');
    expect([page.from, page.to]).toEqual(['2026-11-01', '2026-11-26']);
    expect(api['stats']).toHaveBeenCalledWith('2026-11-01', '2026-11-26');
  });

  it('Paie du personnel : « Période personnalisée » sur le mois en cours', () => {
    const page = TestBed.createComponent(StaffPayStats).componentInstance;
    expect(page.period()).toBe('CUSTOM');
    expect([page.from, page.to]).toEqual(['2026-11', '2026-11']);
    expect(api['payrollStats']).toHaveBeenCalledWith('2026-11', '2026-11', null);
  });

  it('les autres périodes restent disponibles', () => {
    const page = TestBed.createComponent(ClubStats).componentInstance;
    page.setPeriod('LAST12');
    expect(api['stats']).toHaveBeenLastCalledWith();
    page.setPeriod('YEAR');
    expect(api['stats']).toHaveBeenLastCalledWith('2026-01-01', '2026-11-26');
  });

  it('Inscriptions : du 1er du mois en cours à aujourd’hui ; 12 derniers mois calculés sur 12 mois pleins', () => {
    const page = TestBed.createComponent(RegistrationStats).componentInstance;
    expect(page.period()).toBe('CUSTOM');
    expect(api['registrationStats']).toHaveBeenCalledWith('2026-11-01', '2026-11-26');
    page.setPeriod('LAST12');
    expect(api['registrationStats']).toHaveBeenLastCalledWith('2025-12-01', '2026-11-26');
  });

  it('Charges : le mois en cours ; 12 derniers mois et année en cours en mois', () => {
    const page = TestBed.createComponent(ChargeStats).componentInstance;
    expect(page.period()).toBe('CUSTOM');
    expect(api['chargeStats']).toHaveBeenCalledWith('2026-11', '2026-11');
    page.setPeriod('LAST12');
    expect(api['chargeStats']).toHaveBeenLastCalledWith('2025-12', '2026-11');
    page.setPeriod('YEAR');
    expect(api['chargeStats']).toHaveBeenLastCalledWith('2026-01', '2026-11');
  });

  it('3 et 6 derniers mois : mois en cours compris, sur chaque onglet', () => {
    const club = TestBed.createComponent(ClubStats).componentInstance;
    club.setPeriod('LAST3');
    expect(api['stats']).toHaveBeenLastCalledWith('2026-09-01', '2026-11-26');
    club.setPeriod('LAST6');
    expect(api['stats']).toHaveBeenLastCalledWith('2026-06-01', '2026-11-26');

    const pay = TestBed.createComponent(StaffPayStats).componentInstance;
    pay.setPeriod('LAST3');
    expect(api['payrollStats']).toHaveBeenLastCalledWith('2026-09', '2026-11', null);

    const reg = TestBed.createComponent(RegistrationStats).componentInstance;
    reg.setPeriod('LAST6');
    expect(api['registrationStats']).toHaveBeenLastCalledWith('2026-06-01', '2026-11-26');

    const charges = TestBed.createComponent(ChargeStats).componentInstance;
    charges.setPeriod('LAST3');
    expect(api['chargeStats']).toHaveBeenLastCalledWith('2026-09', '2026-11');
  });

  it('Charges : camembert dans l’ordre fixe des catégories, quel que soit le tri des montants', () => {
    const page = TestBed.createComponent(ChargeStats).componentInstance;
    page.s.set({ byCategory: [
      { category: 'ENTRETIEN', label: 'Entretien du matériel', amount: 1200 },
      { category: 'ELECTRICITE', label: 'Électricité', amount: 800 },
    ] } as never);
    expect(page.categories().map((c) => [c.label, c.share])).toEqual([['Électricité', '40 %'], ['Entretien du matériel', '60 %']]);
    expect(page.categoryChart().type).toBe('pie');
  });
});

describe('Statistiques : tableaux retirés', () => {
  beforeEach(() => {
    const done = <T>(v: T) => vi.fn().mockResolvedValue(v);
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: {
          chargeStats: done({ from: '2026-11', to: '2026-11', totalCharges: 0, toPayCount: 0, toPayKnown: 0, revenue: 0, salaries: 0, profit: 0,
            monthly: [], byCategory: [], toPay: [], paid: [] }),
          registrationStats: done({ from: '2026-11-01', to: '2026-11-26', newMembers: 0, renewals: 0, ended: 0, renewed: 0, departures: 0,
            renewalRate: null, net: 0, monthly: [], bySport: [], byDuration: [], byAge: [], newMemberRows: [] }),
        } },
        { provide: ConfigService, useValue: { config: signal({ today: '2026-11-26' }), currency: signal('DH'), pageSize: signal(20) } },
        provideFrDates(),
      ],
    });
  });

  async function text(component: Type<unknown>): Promise<string> {
    const f = TestBed.createComponent(component);
    await f.whenStable();
    f.detectChanges();
    return (f.nativeElement as HTMLElement).textContent!;
  }

  it('Suivi des charges : plus de tableau « Règlements de la période »', async () => {
    const t = await text(ChargeStats);
    expect(t).toContain('Charges à régler');
    expect(t).not.toContain('Règlements de la période');
  });

  it('Suivi des inscriptions : plus de tableau « Nouvelles inscriptions de la période »', async () => {
    const t = await text(RegistrationStats);
    expect(t).toContain('Par durée d’abonnement');
    expect(t).not.toContain('Nouvelles inscriptions de la période');
  });
});
