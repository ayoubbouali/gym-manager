import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { APP_ICONS } from '../../core/icons';
import { PurgePreview, SettingsPayload } from '../../core/models';
import { SettingsPage } from './settings-page';

const bool = (key: string, label: string) => ({ key, group: 'purge', type: 'bool', label, defaultValue: 'true', required: true, min: null, max: null, options: [] });

const payload = {
  groups: { purge: 'Suppression auto' },
  definitions: [
    bool('purge.enabled', 'Supprimer automatiquement les adhérents (chaque nuit)'),
    { key: 'purge.months', group: 'purge', type: 'int', label: 'Délai avant suppression', defaultValue: '3', required: true, min: 1, max: 60, options: [] },
    bool('purge.inactive', 'Adhérents désactivés (depuis leur désactivation)'),
  ],
  values: { 'purge.enabled': 'true', 'purge.months': '3', 'purge.inactive': 'true' },
  secretsSet: {}, nextCodes: {}, regional: { currencies: [], countries: [] },
} as unknown as SettingsPayload;

describe('page Paramètres, onglet Suppression auto', () => {
  let preview: PurgePreview;

  async function render() {
    const fixture = TestBed.createComponent(SettingsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    preview = { enabled: true, months: 3, members: [{ id: 7, code: 'A007', name: 'Sara Alami', reason: 'EXPIRED', since: '2026-07-01' }] };
    const known: Record<string, unknown> = {
      settings: vi.fn().mockResolvedValue(payload),
      get: vi.fn((url: string) => Promise.resolve(url === '/settings/purge-preview' ? preview : [])),
    };
    // every other call of the page (functions, users, roles…) answers an empty list
    const api = new Proxy(known, { get: (t, k: string) => (t[k] ??= vi.fn().mockResolvedValue([])) });
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { user: signal({ username: 'admin' }) } },
        { provide: ConfigService, useValue: { load: vi.fn(), logoUrl: signal(''), customLogoUrl: signal(null), currency: signal('DH') } },
      ],
    });
  });

  it('affiche les réglages, le délai en mois et les adhérents de la prochaine exécution', async () => {
    const f = await render();
    const el: HTMLElement = f.nativeElement;
    expect(el.textContent).toContain('Suppression auto');
    expect([...el.querySelectorAll('.settings-form .field-label')].map((e) => e.textContent!.trim()))
      .toEqual(['Supprimer automatiquement les adhérents (chaque nuit)', 'Délai avant suppression', 'Adhérents désactivés (depuis leur désactivation)']);
    expect(el.querySelector('[matTextSuffix]')!.textContent!.trim()).toBe('mois');
    expect([...el.querySelectorAll('tbody tr td')].map((e) => e.textContent!.trim())).toEqual(['A007', 'Sara Alami', 'Expiré', '01/07/2026']);
    expect(el.textContent).toContain('sans aucun reste à payer');
  });

  it('signale quand la suppression est désactivée', async () => {
    preview = { ...preview, enabled: false };
    const el: HTMLElement = (await render()).nativeElement;
    expect(el.textContent).toContain('La suppression automatique est désactivée : rien ne sera supprimé. Avec ces réglages, elle concernerait 1 adhérent(s).');
  });
});
