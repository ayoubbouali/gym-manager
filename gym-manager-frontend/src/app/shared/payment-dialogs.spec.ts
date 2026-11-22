import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../core/api.service';
import { ConfigService } from '../core/config.service';
import { provideFrDates } from '../core/date-adapter';
import { APP_ICONS } from '../core/icons';
import { PaymentDialog } from './payment-dialogs';

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
