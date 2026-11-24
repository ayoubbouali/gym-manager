import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { APP_ICONS } from '../../core/icons';
import { StaffView } from '../../core/models';
import { PREVIEW_DELAY_MS } from '../members/members-page';
import { StaffPage } from './staff-page';

function staff(id: number, over: Partial<StaffView> = {}): StaffView {
  return {
    id, code: `E00${id}`, lastName: `Nom${id}`, firstName: `Prenom${id}`, name: `Prenom${id} Nom${id}`, phone: '0600000000',
    functionId: 1, function: { id: 1, label: 'Coach' }, sportIds: [], sports: [], payMode: 'FIXED', fixedSalary: 4000,
    active: true, salary: 4000, salaryDetail: { month: '2026-11' },
    ...over,
  } as unknown as StaffView;
}

describe('page Personnel', () => {
  const PREVIEW_ID = 'staff-preview';
  let api: Record<string, ReturnType<typeof vi.fn>>;

  async function render() {
    const fixture = TestBed.createComponent(StaffPage);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const card = () => document.getElementById(PREVIEW_ID);
  const link = (f: Awaited<ReturnType<typeof render>>, code = 'E001') =>
    [...f.nativeElement.querySelectorAll('a.code-link')].find((a) => (a as HTMLElement).textContent!.trim() === code) as HTMLAnchorElement;
  const settle = (f: Awaited<ReturnType<typeof render>>, ms: number) => { vi.advanceTimersByTime(ms); f.detectChanges(); };

  beforeEach(() => {
    api = {
      staff: vi.fn().mockResolvedValue({ rows: [staff(1), staff(2)], payroll: 8000, activeCount: 2 }),
      functions: vi.fn().mockResolvedValue([]),
      sports: vi.fn().mockResolvedValue([]),
    };
    TestBed.configureTestingModule({
      imports: [StaffPage],
      providers: [
        provideRouter([]),
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: ConfigService, useValue: { pageSize: signal(20), currency: signal('DH'), config: signal(null) } },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('l’ID est un lien vers la fiche personnel', async () => {
    const f = await render();
    const a = link(f);
    expect(a.getAttribute('href')).toBe('/personnel/fiche/E001');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    a.click();
    expect(String(navigate.mock.calls[0][0])).toBe('/personnel/fiche/E001');
  });

  it('la carte s’ouvre après le délai de survol, liée au lien, et se ferme quand la souris quitte le lien', async () => {
    const f = await render();
    vi.useFakeTimers();
    const a = link(f);
    a.dispatchEvent(new MouseEvent('mouseenter'));
    settle(f, PREVIEW_DELAY_MS - 1);
    expect(card()).toBeNull();
    settle(f, 1);
    expect(card()!.textContent).toContain('Prenom1 Nom1');
    expect(a.getAttribute('aria-describedby')).toBe(PREVIEW_ID);
    expect(link(f, 'E002').hasAttribute('aria-describedby')).toBe(false);
    a.dispatchEvent(new MouseEvent('mouseleave'));
    f.detectChanges();
    expect(card()).toBeNull();
  });

  it('la carte ne s’ouvre pas quand la souris ne fait que traverser l’ID', async () => {
    const f = await render();
    vi.useFakeTimers();
    const a = link(f);
    a.dispatchEvent(new MouseEvent('mouseenter'));
    settle(f, PREVIEW_DELAY_MS / 2);
    a.dispatchEvent(new MouseEvent('mouseleave'));
    settle(f, PREVIEW_DELAY_MS * 2);
    expect(card()).toBeNull();
  });

  it('la carte s’ouvre au focus clavier et se ferme sur Échap', async () => {
    const f = await render();
    vi.useFakeTimers();
    const a = link(f);
    a.focus();
    f.detectChanges();
    expect(card()).not.toBeNull();
    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true } as KeyboardEventInit));
    f.detectChanges();
    expect(card()).toBeNull();
  });

  it('la carte ouverte au focus se ferme au blur', async () => {
    const f = await render();
    const a = link(f);
    a.focus();
    f.detectChanges();
    expect(card()).not.toBeNull();
    a.blur();
    f.detectChanges();
    expect(card()).toBeNull();
  });

  it('la carte se ferme quand la ligne survolée disparaît (recherche)', async () => {
    const f = await render();
    vi.useFakeTimers();
    link(f).dispatchEvent(new MouseEvent('mouseenter'));
    settle(f, PREVIEW_DELAY_MS);
    expect(card()).not.toBeNull();
    f.componentInstance.t.setSearch('E002');
    f.detectChanges();
    expect(card()).toBeNull();
  });
});
