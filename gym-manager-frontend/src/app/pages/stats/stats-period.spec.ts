import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
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
