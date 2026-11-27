import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ActivityView, StaffOption } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ActivityFormDialog } from './activity-form-dialog';

const staff: StaffOption[] = [
  { id: 1, code: 'E001', name: 'Hamza', active: true, coach: true, internal: false },
  { id: 9, code: 'E009', name: 'Ali Patron', active: true, coach: false, internal: true },
];

async function open(activity?: Partial<ActivityView>) {
  const save = vi.fn().mockResolvedValue({ id: 1 });
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: { save } },
      { provide: NotifyService, useValue: { success: vi.fn() } },
      { provide: MatDialogRef, useValue: { close: vi.fn() } },
      { provide: MAT_DIALOG_DATA, useValue: { activity, staff } },
    ],
  });
  const f = TestBed.createComponent(ActivityFormDialog);
  f.detectChanges();
  await f.whenStable();
  return { f, c: f.componentInstance, save, text: () => (f.nativeElement as HTMLElement).textContent ?? '' };
}

async function refresh(f: Awaited<ReturnType<typeof open>>['f']) {
  f.detectChanges();
  await f.whenStable();
  f.detectChanges();
}

describe('fiche activité : part du responsable', () => {
  it('une activité payante propose 50 % par défaut au responsable, envoyés à l’enregistrement', async () => {
    const { f, c, save, text } = await open();
    expect(text()).not.toContain('Part du responsable');
    Object.assign(c.v, { name: 'Stage', startsAt: '2026-11-28T10:00', paid: true, price: 100, managerId: 1 });
    await refresh(f);
    expect(text()).toContain('Part du responsable');
    expect(c.v.managerPercent).toBe(50);
    await c.save();
    expect(save).toHaveBeenCalledWith('activities', undefined, expect.objectContaining({ price: 100, managerPercent: 50 }));
  });

  it('un responsable interne n’a pas de pourcentage : la fiche l’indique et n’envoie rien', async () => {
    const { f, c, save, text } = await open();
    Object.assign(c.v, { name: 'Soirée', startsAt: '2026-11-28T20:00', paid: true, price: 80, managerId: 9 });
    await refresh(f);
    expect(text()).toContain('Personnel interne : pas de pourcentage');
    expect(text()).not.toContain('Part du responsable');
    await c.save();
    expect(save).toHaveBeenCalledWith('activities', undefined, expect.objectContaining({ managerPercent: null }));
  });

  it('une activité gratuite n’envoie pas de pourcentage ; une activité existante garde le sien', async () => {
    const free = await open();
    Object.assign(free.c.v, { name: 'Footing', startsAt: '2026-11-29T10:00', paid: false, managerId: 1 });
    await free.c.save();
    expect(free.save).toHaveBeenCalledWith('activities', undefined, expect.objectContaining({ price: 0, managerPercent: null }));
    TestBed.resetTestingModule();
    const { c } = await open({ id: 4, code: 'AC004', name: 'Stage', price: 100, managerId: 1, managerPercent: 40, startsAt: '2026-11-28T10:00:00' });
    expect(c.v.managerPercent).toBe(40);
  });
});
