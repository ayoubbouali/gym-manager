import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { APP_ICONS } from '../../core/icons';
import { ClubStats } from './stats-page';
import { StaffPayStats } from './staff-pay-stats';

describe('Statistiques : période par défaut', () => {
  let api: { stats: ReturnType<typeof vi.fn>; payrollStats: ReturnType<typeof vi.fn>; staffOptions: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // never resolved: only the request matters, the template is not rendered
    api = { stats: vi.fn(() => new Promise(() => {})), payrollStats: vi.fn(() => new Promise(() => {})), staffOptions: vi.fn().mockResolvedValue([]) };
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
    expect(api.stats).toHaveBeenCalledWith('2026-11-01', '2026-11-26');
  });

  it('Paie du personnel : « Période personnalisée » sur le mois en cours', () => {
    const page = TestBed.createComponent(StaffPayStats).componentInstance;
    expect(page.period()).toBe('CUSTOM');
    expect([page.from, page.to]).toEqual(['2026-11', '2026-11']);
    expect(api.payrollStats).toHaveBeenCalledWith('2026-11', '2026-11', null);
  });

  it('les autres périodes restent disponibles', () => {
    const page = TestBed.createComponent(ClubStats).componentInstance;
    page.setPeriod('LAST12');
    expect(api.stats).toHaveBeenLastCalledWith();
    page.setPeriod('YEAR');
    expect(api.stats).toHaveBeenLastCalledWith('2026-01-01', '2026-11-26');
  });
});
