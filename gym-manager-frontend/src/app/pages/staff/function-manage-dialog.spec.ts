import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';
import { FunctionManageDialog } from './staff-dialogs';

const functions = [
  { id: 1, label: 'Coach', active: true }, { id: 2, label: 'Kiné', active: true }, { id: 3, label: 'Gardien', active: false },
];

function open() {
  const api = { post: vi.fn().mockResolvedValue({ id: 9 }), remove: vi.fn().mockResolvedValue(undefined) };
  const ref = { close: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: NotifyService, useValue: { success: vi.fn() } },
      { provide: MAT_DIALOG_DATA, useValue: { functions, used: new Set([1]) } },
      { provide: MatDialogRef, useValue: ref },
    ],
  });
  const f = TestBed.createComponent(FunctionManageDialog);
  f.detectChanges();
  return { f, api, ref };
}

describe('fenêtre Fonctions', () => {
  it('Ajouter : envoie le libellé saisi', async () => {
    const { f, api, ref } = open();
    f.componentInstance.label = ' Kinésithérapeute ';
    await f.componentInstance.add();
    expect(api.post).toHaveBeenCalledWith('/functions', { label: 'Kinésithérapeute' });
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('Supprimer : les fonctions affectées sont grisées, plusieurs se suppriment d’un coup', async () => {
    const { f, api } = open();
    f.componentInstance.mode.set('DELETE');
    f.detectChanges();
    await f.whenStable();
    const boxes = [...(f.nativeElement as HTMLElement).querySelectorAll('mat-checkbox')];
    expect(boxes.map((b) => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Coach (affectée)', 'Kiné', 'Gardien (inactive)']);
    expect(boxes.map((b) => b.querySelector('input')!.disabled)).toEqual([true, false, false]);
    f.componentInstance.toggle(2, true);
    f.componentInstance.toggle(3, true);
    await f.componentInstance.remove();
    expect(api.remove.mock.calls).toEqual([['functions', 2], ['functions', 3]]);
  });
});
