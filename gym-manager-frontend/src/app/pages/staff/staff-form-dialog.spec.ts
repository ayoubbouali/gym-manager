import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { APP_ICONS } from '../../core/icons';
import { PhoneCountry, StaffView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { StaffFormDialog } from './staff-dialogs';

const COUNTRIES: PhoneCountry[] = [{ code: 'MA', label: 'Maroc', dialCode: '212', example: '06 50 12 34 56', primary: true }];
const functions = [{ id: 1, label: 'Coach', active: true }, { id: 2, label: 'Accueil', active: true }];
const sports = [{ id: 5, name: 'Karaté', color: '#E53935', active: true }];

function open(staff?: Partial<StaffView>) {
  const api = { save: vi.fn().mockResolvedValue({}) };
  TestBed.configureTestingModule({
    providers: [
      importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
      { provide: ApiService, useValue: api },
      { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: MatDialogRef, useValue: { close: vi.fn() } },
      { provide: MAT_DIALOG_DATA, useValue: { staff, functions, sports } },
      { provide: ConfigService, useValue: { config: signal({ today: '2026-11-27' }), country: signal('MA'), phoneCountries: signal(COUNTRIES),
        loadPhoneCountries: vi.fn().mockResolvedValue(undefined), currency: signal('DH') } },
    ],
  });
  const f = TestBed.createComponent(StaffFormDialog);
  f.detectChanges();
  return { f, api };
}

const sportsField = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelector('app-multi-select');

describe('fenêtre Personnel : sports encadrés', () => {
  it('le champ n’apparaît que pour la fonction Coach', async () => {
    const { f } = open();
    expect(sportsField(f)).toBeNull();
    const pick = async (functionId: number) => {
      // as the select does: ngModel writes its value asynchronously
      f.componentInstance.v.functionId = functionId;
      await f.whenStable();
      f.detectChanges();
    };
    await pick(1);
    expect(sportsField(f)).not.toBeNull();
    await pick(2);
    expect(sportsField(f)).toBeNull();
  });

  it('obligatoire pour un coach : refusé sans sport, envoyé avec', async () => {
    const { f, api } = open();
    Object.assign(f.componentInstance.v, { lastName: 'Hamza', functionId: 1 });
    await f.componentInstance.save();
    expect(api.save).not.toHaveBeenCalled();
    expect(f.componentInstance.error()).toContain('au moins un sport encadré');
    f.componentInstance.v.sportIds = [5];
    await f.componentInstance.save();
    expect(api.save).toHaveBeenCalledWith('staff', undefined, expect.objectContaining({ functionId: 1, sportIds: [5] }));
  });

  it('une autre fonction n’encadre aucun sport, même si elle en avait', async () => {
    const { f, api } = open({ id: 4, code: 'P004', lastName: 'Sara', functionId: 2, sportIds: [5], internal: false, payMode: 'FIXED',
      fixedSalary: 3000 });
    await f.componentInstance.save();
    expect(api.save).toHaveBeenCalledWith('staff', 4, expect.objectContaining({ functionId: 2, sportIds: [] }));
  });
});
