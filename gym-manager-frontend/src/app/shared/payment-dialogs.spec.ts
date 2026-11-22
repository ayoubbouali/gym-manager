import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../core/api.service';
import { ConfigService } from '../core/config.service';
import { provideFrDates } from '../core/date-adapter';
import { APP_ICONS } from '../core/icons';
import { MemberCard } from '../core/models';
import { PaymentDialog, RenewDialog } from './payment-dialogs';

describe('popup paiement : date du paiement', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = { post: vi.fn().mockResolvedValue({}), put: vi.fn().mockResolvedValue({}) };
    TestBed.configureTestingModule({
      imports: [PaymentDialog],
      providers: [
        provideFrDates(),
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: { memberId: 1, memberLabel: 'A001 Lina Bennis', subscriptions: [] } },
        { provide: ConfigService, useValue: { config: signal({ today: '2026-11-22' }), currency: signal('DH') } },
      ],
    });
  });

  async function typeDate(text: string) {
    const f = TestBed.createComponent(PaymentDialog);
    f.detectChanges();
    await f.whenStable();
    f.componentInstance.amount = 100;
    const el = f.nativeElement.querySelector('app-date-field input') as HTMLInputElement;
    el.value = text;
    el.dispatchEvent(new Event('input'));
    f.detectChanges();
    await f.whenStable();
    return f;
  }

  for (const text of ['31/02/2026', 'abc', '23/11/2026']) {
    it(`n’envoie rien et affiche l’erreur pour « ${text} »`, async () => {
      const f = await typeDate(text);
      await f.componentInstance.save();
      f.detectChanges();
      expect(api['post']).not.toHaveBeenCalled();
      expect(f.nativeElement.querySelector('app-date-field mat-error')).not.toBeNull();
    });
  }

  it('envoie la date saisie quand elle est valide', async () => {
    const f = await typeDate('20/11/2026');
    await f.componentInstance.save();
    expect(api['post']).toHaveBeenCalledWith('/payments', expect.objectContaining({ paidOn: '2026-11-20', amount: 100 }));
  });
});

describe('popup renouvellement : nouvel abonnement', () => {
  function render(subscriptions: unknown[]) {
    const card = {
      member: { id: 1, code: 'A001', firstName: 'Lina', lastName: 'Bennis', sportIds: [1], packId: null, discountId: null, balance: 0 },
      subscriptions, renewalStart: '2026-11-22', activities: [], alertMessage: null, whatsappLink: null,
    } as unknown as MemberCard;
    TestBed.configureTestingModule({
      imports: [RenewDialog],
      providers: [
        provideFrDates(),
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: { packs: vi.fn().mockResolvedValue([]), discounts: vi.fn().mockResolvedValue([]), memberPreview: vi.fn() } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: card },
        { provide: ConfigService, useValue: { config: signal({ today: '2026-11-22' }), currency: signal('DH') } },
      ],
    });
    const f = TestBed.createComponent(RenewDialog);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('sans abonnement : titre et bouton « Nouvel abonnement », sans ligne « Dernière période »', () => {
    const el = render([]);
    expect(el.querySelector('h2')!.textContent).toContain('Nouvel abonnement');
    expect(el.textContent).not.toContain('Dernière période');
    expect(el.querySelector('button[type="submit"]')!.textContent!.trim()).toBe("Créer l'abonnement");
  });

  it('avec un abonnement : renouvellement classique', () => {
    const el = render([{ id: 5, packName: 'Karaté - Mensuel', endDate: '2026-12-18' }]);
    expect(el.querySelector('h2')!.textContent).toContain('Renouveler l\'abonnement');
    expect(el.textContent).toContain('Dernière période : Karaté - Mensuel');
    expect(el.querySelector('button[type="submit"]')!.textContent!.trim()).toBe('Renouveler');
  });
});
