import { importProvidersFrom, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { APP_ICONS } from '../../core/icons';
import { NoteReminder } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { NoteReminders, NoteRemindersDialog, lateLabel } from './note-reminders';

const config = { config: signal({ today: '2026-11-27' }), currency: signal('DH'), pageSize: signal(10) };
const reminders: NoteReminder[] = [
  { memberId: 3, code: 'A003', name: 'Alami Sara', notes: 'Rappeler pour le kimono', notesUpdatedOn: '2026-11-26' },
  { memberId: 4, code: 'A004', name: 'Idrissi Omar', notes: 'Certificat médical manquant', notesUpdatedOn: '2026-11-20' },
];

describe('rappel des notes non traitées', () => {
  it('libellé du retard', () => {
    expect(lateLabel(reminders[0], '2026-11-27')).toBe('Depuis hier');
    expect(lateLabel(reminders[1], '2026-11-27')).toBe('Depuis 7 jours');
    expect(lateLabel({ ...reminders[0], notesUpdatedOn: null }, '2026-11-27')).toBe('Note ancienne');
  });

  function banner(list: NoteReminder[], afterClosed: unknown = true) {
    const api = { noteReminders: vi.fn().mockResolvedValue(list) };
    const dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(afterClosed) }) };
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: ConfigService, useValue: config },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    return { f: TestBed.createComponent(NoteReminders), api, dialog };
  }

  it('affiche le bandeau défilant avec chaque note, et rien quand il n’y en a pas', async () => {
    const { f } = banner(reminders);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.nr-title')!.textContent).toContain('2 notes à traiter');
    // twice, so that the scrolling loops
    expect(el.querySelectorAll('.nr-item').length).toBe(4);
    expect(el.textContent).toContain('Certificat médical manquant');
    expect(el.textContent).toContain('Depuis 7 jours');

    TestBed.resetTestingModule();
    const empty = banner([]).f;
    empty.detectChanges();
    await empty.whenStable();
    empty.detectChanges();
    expect((empty.nativeElement as HTMLElement).querySelector('.nr-banner')).toBeNull();
  });

  it('un clic ouvre la popup ; après traitement, la page est rechargée', async () => {
    const { f, dialog } = banner(reminders);
    const changed = vi.fn();
    f.componentInstance.changed.subscribe(changed);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.nr-banner')!.click();
    await f.whenStable();
    expect(dialog.open).toHaveBeenCalledWith(NoteRemindersDialog, expect.objectContaining({ data: reminders }));
    expect(changed).toHaveBeenCalled();
  });

  it('popup : envoie pour chaque note « traité » ou « à relancer », seulement celles choisies', async () => {
    const api = { treatNoteReminders: vi.fn().mockResolvedValue(undefined) };
    const ref = { close: vi.fn() };
    const notify = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: ConfigService, useValue: config },
        { provide: MAT_DIALOG_DATA, useValue: reminders },
        { provide: MatDialogRef, useValue: ref },
        { provide: NotifyService, useValue: notify },
      ],
    });
    const f = TestBed.createComponent(NoteRemindersDialog);
    f.detectChanges();
    const c = f.componentInstance;
    expect(c.count()).toBe(0);
    c.choose(4, 'LATER');
    await c.save();
    expect(api.treatNoteReminders).toHaveBeenLastCalledWith([{ memberId: 4, action: 'LATER' }]);
    c.all('DONE');
    c.choose(4, 'LATER');
    await c.save();
    expect(api.treatNoteReminders).toHaveBeenLastCalledWith([{ memberId: 3, action: 'DONE' }, { memberId: 4, action: 'LATER' }]);
    expect(notify.success).toHaveBeenLastCalledWith('1 note traitée, 1 à relancer demain.');
    expect(ref.close).toHaveBeenCalledWith(true);
  });
});
