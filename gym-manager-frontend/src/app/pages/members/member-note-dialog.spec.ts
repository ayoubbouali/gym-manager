import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { APP_ICONS } from '../../core/icons';
import { MemberView } from '../../core/models';
import { ConfirmService } from '../../shared/confirm.service';
import { MemberNoteDialog } from './member-note-dialog';

const member = { id: 7, code: 'A007', firstName: 'Lina', lastName: 'Bennis', notes: 'Allergie\nau pollen' } as MemberView;

describe('popup Note adhérent', () => {
  let api: { memberNotes: ReturnType<typeof vi.fn> };
  let ref: { close: ReturnType<typeof vi.fn> };
  let confirm: { confirm: ReturnType<typeof vi.fn> };

  function create(data: MemberView = member) {
    TestBed.overrideProvider(MAT_DIALOG_DATA, { useValue: data });
    const f = TestBed.createComponent(MemberNoteDialog);
    f.detectChanges();
    return f;
  }

  beforeEach(() => {
    api = { memberNotes: vi.fn().mockResolvedValue({ ...member }) };
    ref = { close: vi.fn() };
    confirm = { confirm: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      imports: [MemberNoteDialog],
      providers: [
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: MatDialogRef, useValue: ref },
        { provide: ConfirmService, useValue: confirm },
        { provide: MAT_DIALOG_DATA, useValue: member },
      ],
    });
  });

  it('affiche la note en lecture', () => {
    const f = create();
    expect(f.nativeElement.querySelector('.note-text').textContent).toBe('Allergie\nau pollen');
  });

  it('Modifier puis Enregistrer envoie la nouvelle note et ferme avec true', async () => {
    const f = create();
    f.componentInstance.startEdit();
    expect(f.componentInstance.draft).toBe('Allergie\nau pollen');
    f.componentInstance.draft = 'Asthme';
    await f.componentInstance.save();
    expect(api.memberNotes).toHaveBeenCalledWith(7, 'Asthme');
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('une note vide à l’enregistrement demande la confirmation puis efface la note', async () => {
    const f = create();
    f.componentInstance.startEdit();
    f.componentInstance.draft = '   ';
    await f.componentInstance.save();
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true, confirmLabel: 'Supprimer' }));
    expect(api.memberNotes).toHaveBeenCalledWith(7, '');
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('une note vide dont la confirmation est annulée n’envoie rien et reste en modification', async () => {
    confirm.confirm.mockResolvedValue(false);
    const f = create();
    f.componentInstance.startEdit();
    f.componentInstance.draft = '   ';
    await f.componentInstance.save();
    expect(api.memberNotes).not.toHaveBeenCalled();
    expect(ref.close).not.toHaveBeenCalled();
    expect(f.componentInstance.editing()).toBe(true);
  });

  it('Supprimer confirme puis efface la note', async () => {
    const f = create();
    await f.componentInstance.remove();
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true, confirmLabel: 'Supprimer' }));
    expect(api.memberNotes).toHaveBeenCalledWith(7, '');
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('annuler la confirmation ne change rien', async () => {
    confirm.confirm.mockResolvedValue(false);
    const f = create();
    await f.componentInstance.remove();
    expect(api.memberNotes).not.toHaveBeenCalled();
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('une erreur serveur s’affiche dans la popup, qui reste ouverte', async () => {
    api.memberNotes.mockRejectedValue(new Error('Le champ « Notes » ne doit pas dépasser 2000 caractères.'));
    const f = create();
    f.componentInstance.startEdit();
    f.componentInstance.draft = 'x'.repeat(2001);
    await f.componentInstance.save();
    expect(ref.close).not.toHaveBeenCalled();
    expect(f.componentInstance.error()).not.toBe('');
    expect(f.componentInstance.editing()).toBe(true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });
});
