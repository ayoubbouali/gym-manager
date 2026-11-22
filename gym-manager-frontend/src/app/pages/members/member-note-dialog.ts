import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { MemberView } from '../../core/models';
import { errorMessage } from '../../core/notify.service';
import { ConfirmService } from '../../shared/confirm.service';

/** Same limit as the server (Check.text). */
const NOTE_MAX_LENGTH = 2000;

/** Views, edits or deletes a member's note through its own endpoint (the subscription is never re-priced). */
@Component({
  selector: 'app-member-note',
  imports: [FormsModule, MatDialogModule, MatButtonModule, LucideAngularModule],
  template: `
    <h2 mat-dialog-title>Note — {{ member.code }} · {{ member.firstName }} {{ member.lastName }}</h2>
    <mat-dialog-content>
      @if (editing()) {
        <form id="member-note-form" (ngSubmit)="save()">
          <label class="sr-only" for="member-note-text">Note</label>
          <textarea id="member-note-text" class="textarea" name="notes" rows="8" [maxlength]="max"
                    [(ngModel)]="draft"></textarea>
          <p class="muted note-counter">{{ draft.length }} / {{ max }}</p>
        </form>
      } @else if (member.notes.trim()) {
        <p class="note-text">{{ member.notes }}</p>
      } @else {
        <p class="muted">Aucune note.</p>
      }
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (editing()) {
        <button mat-button type="button" (click)="cancelEdit()" [disabled]="busy()">Annuler</button>
        <button mat-flat-button type="submit" form="member-note-form" [disabled]="busy()">Enregistrer</button>
      } @else {
        <button mat-button type="button" class="note-delete" (click)="remove()" [disabled]="busy() || !member.notes.trim()">
          <lucide-icon name="trash-2" [size]="16" /> Supprimer
        </button>
        <span class="grow"></span>
        <button mat-button mat-dialog-close type="button" [disabled]="busy()">Fermer</button>
        <button mat-flat-button type="button" (click)="startEdit()" [disabled]="busy()"><lucide-icon name="pencil" [size]="16" /> Modifier</button>
      }
    </mat-dialog-actions>
  `,
})
export class MemberNoteDialog {
  member = inject<MemberView>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MemberNoteDialog>);
  private api = inject(ApiService);
  private confirm = inject(ConfirmService);
  readonly max = NOTE_MAX_LENGTH;
  editing = signal(false);
  busy = signal(false);
  error = signal('');
  draft = '';

  startEdit(): void {
    this.draft = this.member.notes;
    this.error.set('');
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.error.set('');
    this.editing.set(false);
  }

  /** A blank note is a deletion, so it goes through the same confirmation. */
  save(): Promise<void> {
    return this.draft.trim() ? this.submit(this.draft) : this.remove();
  }

  async remove(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `Supprimer la note de ${this.member.code} — ${this.member.firstName} ${this.member.lastName} ?`,
      message: 'La note sera effacée. Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (ok) await this.submit('');
  }

  private async submit(notes: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    // Closing mid-request would skip the reload, leaving a stale icon on the page.
    const disableClose = this.ref.disableClose;
    this.ref.disableClose = true;
    try {
      await this.api.memberNotes(this.member.id, notes);
      this.ref.close(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.ref.disableClose = disableClose;
      this.busy.set(false);
    }
  }
}

/** Resolves true when the note was saved or deleted. */
export async function openMemberNote(dialog: MatDialog, member: MemberView): Promise<boolean> {
  const ref = dialog.open(MemberNoteDialog, { data: member, width: '560px', maxWidth: '96vw' });
  return (await firstValueFrom(ref.afterClosed())) === true;
}
