import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { provideFrDates } from '../../core/date-adapter';
import { APP_ICONS } from '../../core/icons';
import { ChargeMonth, ChargeView } from '../../core/models';
import { ChargeFormDialog } from './charge-dialogs';
import { ChargesPage } from './charges-page';

const config = { config: signal({ today: '2026-11-26' }), currency: signal('DH'), pageSize: signal(20) };

function charge(over: Partial<ChargeView> = {}): ChargeView {
  return { id: 1, label: 'Électricité', category: 'ELECTRICITE', categoryLabel: 'Électricité', permanent: true, period: null, amount: null,
    startPeriod: '2026-11', endPeriod: null, active: true, autoPay: false, autoMethod: null, note: '', paymentCount: 0, totalPaid: 0, ...over };
}

describe('fenêtre Nouvelle charge', () => {
  let api: { save: ReturnType<typeof vi.fn> };

  function open(data: object = { period: '2026-11' }) {
    api = { save: vi.fn().mockResolvedValue({}) };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ConfigService, useValue: config },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        provideFrDates(),
      ],
    });
    // not rendered yet: each test sets its choices first, as the user would before saving
    return TestBed.createComponent(ChargeFormDialog);
  }

  async function submit(f: ReturnType<typeof open>) {
    f.detectChanges();
    await f.whenStable();
    await f.componentInstance.save();
  }

  it('permanente par défaut : envoyée sans mois ni montant', async () => {
    const f = open();
    Object.assign(f.componentInstance, { label: 'Électricité', category: 'ELECTRICITE' });
    await submit(f);
    expect(api.save).toHaveBeenCalledWith('charges', undefined, expect.objectContaining({ permanent: true, period: null, amount: null, autoPay: false, payNow: false }));
  });

  it('permanente à montant connu, réglée automatiquement chaque mois', async () => {
    const f = open();
    Object.assign(f.componentInstance, { label: 'Loyer', category: 'LOYER', known: true, amount: 3000, method: 'VIREMENT' });
    await submit(f);
    expect(api.save).toHaveBeenCalledWith('charges', undefined, expect.objectContaining({
      permanent: true, period: null, amount: 3000, autoPay: true, method: 'VIREMENT', paidOn: '2026-11-26' }));
  });

  it('permanente à montant connu, réglée juste ce mois-ci', async () => {
    const f = open();
    Object.assign(f.componentInstance, { label: 'Internet', category: 'INTERNET', known: true, amount: 400, autoPay: false });
    await submit(f);
    expect(api.save).toHaveBeenCalledWith('charges', undefined, expect.objectContaining({ permanent: true, amount: 400, autoPay: false }));
  });

  it('en modification d’une permanente automatique : montant et mode repris, le règlement automatique se coupe', async () => {
    const f = open({ charge: charge({ id: 5, autoPay: true, amount: 3000, autoMethod: 'VIREMENT' }) });
    const c = f.componentInstance;
    expect([c.known, c.amount, c.method]).toEqual([true, 3000, 'VIREMENT']);
    c.known = false;
    await submit(f);
    expect(api.save).toHaveBeenCalledWith('charges', 5, expect.objectContaining({ amount: null, autoPay: false }));
  });

  it('ponctuelle à montant connu, réglée tout de suite', async () => {
    const f = open();
    const c = f.componentInstance;
    Object.assign(c, { label: 'Réparation tapis', category: 'ENTRETIEN', permanent: false, known: true, amount: 1200, payNow: true, method: 'CARTE' });
    await submit(f);
    expect(api.save).toHaveBeenCalledWith('charges', undefined, expect.objectContaining({
      permanent: false, period: '2026-11', amount: 1200, payNow: true, method: 'CARTE', paidOn: '2026-11-26' }));
  });

  it('ponctuelle à montant inconnu : ni montant ni règlement', async () => {
    const f = open();
    const c = f.componentInstance;
    Object.assign(c, { label: 'Ménage', category: 'MENAGE', permanent: false, known: false, amount: 50, payNow: true });
    await submit(f);
    expect(api.save).toHaveBeenCalledWith('charges', undefined, expect.objectContaining({ permanent: false, amount: null, payNow: false }));
  });

  it('en modification, le type est affiché mais ne se change pas', () => {
    const f = open({ charge: charge({ id: 4 }) });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('le type ne change pas après la création');
    expect(f.nativeElement.querySelector('mat-button-toggle-group[name="permanent"]')).toBeNull();
  });
});

describe('page Charges', () => {
  const month: ChargeMonth = {
    period: '2026-11', currentMonth: true, totalPaid: 850, toPayCount: 1, toPayKnown: 0,
    rows: [
      { charge: charge(), period: '2026-11', expected: null, scheduled: false,
        payment: { id: 9, chargeId: 1, period: '2026-11', amount: 850, method: 'VIREMENT', methodLabel: 'Virement', paidOn: '2026-11-20', note: '',
          createdAt: '', createdBy: 'admin', updatedAt: null, updatedBy: null } },
      { charge: charge({ id: 2, label: 'Ménage', category: 'MENAGE', categoryLabel: 'Ménage', permanent: false, period: '2026-11', startPeriod: null }),
        period: '2026-11', expected: null, payment: null, scheduled: false },
      { charge: charge({ id: 3, label: 'Loyer', category: 'LOYER', categoryLabel: 'Loyer', autoPay: true, amount: 3000, autoMethod: 'VIREMENT' }),
        period: '2026-11', expected: 3000, payment: null, scheduled: true },
    ],
  };

  async function render(canManage: boolean) {
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: { chargeMonth: vi.fn().mockResolvedValue(month) } },
        { provide: ConfigService, useValue: config },
        { provide: AuthService, useValue: { can: (p: string) => canManage && p === 'MANAGE_CHARGES' } },
        provideFrDates(),
      ],
    });
    const f = TestBed.createComponent(ChargesPage);
    await f.whenStable();
    f.detectChanges();
    return f;
  }

  it('affiche le mois en cours : réglée, à régler et montant à saisir', async () => {
    const el: HTMLElement = (await render(true)).nativeElement;
    expect(el.querySelector('.month-title')!.textContent).toBe('Charges de novembre 2026');
    expect(el.querySelectorAll('table').length).toBe(1);
    const rows = [...el.querySelectorAll('tbody tr')].map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('Réglée');
    expect(rows[1]).toContain('À saisir');
    expect(rows[1]).toContain('Régler');
    expect(rows[2]).toContain('Automatique');
    expect(rows[2]).not.toContain('Régler');
    expect(el.textContent).toContain('Permanente depuis novembre 2026');
    expect(el.textContent).toContain('Permanente, réglée automatiquement, depuis novembre 2026');
    expect(el.textContent).toContain('Ponctuelle · novembre 2026');
    expect(el.querySelector('[aria-label="Actions sur la charge Ménage"]')).not.toBeNull();
  });

  it('sans le droit de correction, ni corriger ni supprimer un règlement', async () => {
    const el: HTMLElement = (await render(false)).nativeElement;
    expect(el.querySelector('[aria-label="Corriger le règlement de Électricité"]')).toBeNull();
    expect(el.querySelector('[aria-label="Supprimer le règlement de Électricité"]')).toBeNull();
  });

  it('avec le droit, les deux actions sont proposées', async () => {
    const el: HTMLElement = (await render(true)).nativeElement;
    expect(el.querySelector('[aria-label="Corriger le règlement de Électricité"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Supprimer le règlement de Électricité"]')).not.toBeNull();
  });
});
