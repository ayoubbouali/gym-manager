import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { APP_ICONS } from '../../core/icons';
import { SportView, StaffOption } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { SportFormDialog } from './sport-form-dialog';

const staff: StaffOption[] = [
  { id: 1, code: 'E001', name: 'Hamza', active: true, coach: true, internal: false },
  { id: 2, code: 'E006', name: 'Bouzid Yassir', active: true, coach: false, internal: false },
  { id: 3, code: 'E008', name: 'Errami Mustapha', active: true, coach: false, internal: false },
];

function open(sport?: Partial<SportView>) {
  TestBed.configureTestingModule({
    providers: [
      importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
      { provide: ApiService, useValue: { save: vi.fn() } },
      { provide: NotifyService, useValue: { success: vi.fn() } },
      { provide: MatDialogRef, useValue: { close: vi.fn() } },
      { provide: MAT_DIALOG_DATA, useValue: { sport, staff } },
    ],
  });
  return TestBed.createComponent(SportFormDialog).componentInstance;
}

describe('fiche sport : coachs', () => {
  it('ne propose que le personnel dont la fonction est Coach', () => {
    expect(open().coachOptions.map((o) => o.id)).toEqual([1]);
  });

  it('un non-coach déjà affecté reste affiché, grisé, pour être retiré en connaissance de cause', () => {
    const options = open({ coachIds: [1, 2], schedules: [] }).coachOptions;
    expect(options.map((o) => o.id)).toEqual([1, 2]);
    expect(options[1]).toEqual(expect.objectContaining({ label: 'Bouzid Yassir (pas coach)', disabled: true }));
  });
});
