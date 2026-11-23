import { HttpErrorResponse } from '@angular/common/http';
import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { provideFrDates } from '../../core/date-adapter';
import { APP_ICONS } from '../../core/icons';
import { MemberView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { MemberFormDialog } from './member-form-dialog';

describe('popup adhérent : message d’erreur', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  async function create() {
    const f = TestBed.createComponent(MemberFormDialog);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  }

  beforeEach(() => {
    api = {
      sports: vi.fn().mockResolvedValue([]), packs: vi.fn().mockResolvedValue([]), discounts: vi.fn().mockResolvedValue([]),
      memberPreview: vi.fn().mockResolvedValue(null), save: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [MemberFormDialog],
      providers: [
        provideFrDates(),
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: ConfigService, useValue: { config: signal({ today: '2026-11-22' }), phoneExample: signal('06 50 12 34 56'), currency: signal('DH') } },
      ],
    });
  });

  it('s’affiche en haut de la popup, avant les champs, et ramène le défilement en haut', async () => {
    const f = await create();
    const content = f.nativeElement.querySelector('mat-dialog-content') as HTMLElement;
    content.scrollTop = 200;
    await f.componentInstance.save();
    f.detectChanges();
    const error = content.querySelector('.form-error') as HTMLElement;
    expect(error.getAttribute('role')).toBe('alert');
    expect(content.firstElementChild).toBe(error);
    expect(error.compareDocumentPosition(content.querySelector('form')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(content.querySelectorAll('.form-error').length).toBe(1);
    expect(content.scrollTop).toBe(0);
  });

  it('affiche aussi en haut l’erreur renvoyée par le serveur', async () => {
    const f = await create();
    f.componentInstance.form.patchValue({ lastName: 'Bennis', firstName: 'Lina', phone: '0740123456', sportIds: [1], packId: 1 });
    api['save'].mockRejectedValue(new HttpErrorResponse({ status: 400, error: { message: 'Numéro de téléphone invalide pour l’indicatif +212.', field: 'phone' } }));
    const content = f.nativeElement.querySelector('mat-dialog-content') as HTMLElement;
    content.scrollTop = 200;
    await f.componentInstance.save();
    f.detectChanges();
    expect(api['save']).toHaveBeenCalled();
    expect(content.scrollTop).toBe(0);
    expect(content.firstElementChild!.classList).toContain('form-error');
    expect(content.firstElementChild!.textContent).toContain('Numéro de téléphone invalide');
  });
});

describe('popup adhérent : adhérent sans abonnement', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  const member = {
    id: 9, code: 'A009', lastName: 'Bennis', firstName: 'Lina', phone: '0740123456', birthDate: null, registrationDate: '2026-11-01',
    sportIds: [1], packId: null, pack: null, discountId: null, discount: null, insurance: 'PAYE', notes: '', situation: 'NONE', state: 'NONE',
  } as unknown as MemberView;

  beforeEach(() => {
    api = {
      sports: vi.fn().mockResolvedValue([]), packs: vi.fn().mockResolvedValue([]), discounts: vi.fn().mockResolvedValue([]),
      memberPreview: vi.fn().mockResolvedValue(null), save: vi.fn().mockResolvedValue(member),
    };
    TestBed.configureTestingModule({
      imports: [MemberFormDialog],
      providers: [
        provideFrDates(),
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: { member } },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: ConfigService, useValue: { config: signal({ today: '2026-11-22' }), phoneExample: signal('06 50 12 34 56'), currency: signal('DH') } },
      ],
    });
  });

  it('ne demande pas de pack et enregistre sans', async () => {
    const f = TestBed.createComponent(MemberFormDialog);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('mat-select[formControlName="packId"]')).toBeNull();
    expect(el.querySelector('.computed-box')).toBeNull();
    expect(el.textContent).toContain('Nouvel abonnement');
    await f.componentInstance.save();
    expect(api['save']).toHaveBeenCalledWith('members', 9, expect.objectContaining({ packId: null }));
  });
});
