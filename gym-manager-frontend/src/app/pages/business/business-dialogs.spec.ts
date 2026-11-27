import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { provideFrDates } from '../../core/date-adapter';
import { APP_ICONS } from '../../core/icons';
import { BusinessFormDialog } from './business-dialogs';

const config = { config: signal({ today: '2026-11-26' }), currency: signal('DH'), pageSize: signal(20) };

describe('fenêtre Nouveau business', () => {
  let api: { save: ReturnType<typeof vi.fn> };

  function open(data: object = { period: '2026-11', members: [{ id: 7, label: 'A007 · Sara Alami' }] }) {
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
    return TestBed.createComponent(BusinessFormDialog);
  }

  async function submit(f: ReturnType<typeof open>) {
    f.detectChanges();
    await f.whenStable();
    await f.componentInstance.save();
  }

  it('vente ponctuelle encaissée tout de suite, sans adhérent', async () => {
    const f = open();
    Object.assign(f.componentInstance, { label: 'Kimono', category: 'EQUIPEMENT', amount: 450 });
    await submit(f);
    expect(api.save).toHaveBeenCalledWith('business', undefined, expect.objectContaining({
      permanent: false, period: '2026-11', amount: 450, memberId: null, autoPay: false, payNow: true, method: 'ESPECES' }));
  });

  it('coaching mensuel lié à un adhérent, encaissé automatiquement', async () => {
    const f = open();
    Object.assign(f.componentInstance, { label: 'Coaching privé', category: 'COACHING', permanent: true, amount: 200, linked: true, memberId: 7 });
    await submit(f);
    expect(api.save).toHaveBeenCalledWith('business', undefined, expect.objectContaining({
      permanent: true, period: null, amount: 200, memberId: 7, autoPay: true, payNow: false }));
  });

  it('permanent « juste ce mois-ci » : encaisse le mois en cours sans automatisme', async () => {
    const f = open();
    Object.assign(f.componentInstance, { label: 'Programme', category: 'PROGRAMME', permanent: true, amount: 100, collect: 'NOW' });
    await submit(f);
    expect(api.save).toHaveBeenCalledWith('business', undefined, expect.objectContaining({ autoPay: false, payNow: true }));
  });

  it('lié à un adhérent sans l’avoir choisi : refusé avant l’envoi', async () => {
    const f = open();
    Object.assign(f.componentInstance, { label: 'Whey', category: 'NUTRITION', amount: 300, linked: true });
    await submit(f);
    expect(api.save).not.toHaveBeenCalled();
    expect(f.componentInstance.error()).toContain('Choisissez l’adhérent');
  });
});
