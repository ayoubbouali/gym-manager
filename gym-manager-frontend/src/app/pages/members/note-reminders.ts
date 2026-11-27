import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { FrDatePipe } from '../../core/format';
import { NoteReminder, NoteReminderChoice } from '../../core/models';
import { NotifyService, errorMessage } from '../../core/notify.service';

/** Days between the note and today; null for a note written before the reminders existed. */
export function daysLate(r: NoteReminder, today: string): number | null {
  if (!r.notesUpdatedOn) return null;
  return Math.round((Date.parse(today) - Date.parse(r.notesUpdatedOn)) / 86_400_000);
}

export function lateLabel(r: NoteReminder, today: string): string {
  const d = daysLate(r, today);
  return d === null ? 'Note ancienne' : d === 1 ? 'Depuis hier' : `Depuis ${d} jours`;
}

/**
 * Reminder of the members' notes left untreated for at least a day, at the top of the members page: a ticker that scrolls
 * them horizontally; a click opens the dialog to treat them.
 */
@Component({
  selector: 'app-note-reminders',
  imports: [LucideAngularModule],
  template: `
    @if (reminders().length) {
      <button type="button" class="nr-banner" animate.enter="nr-in" (click)="open()"
              [attr.aria-label]="title() + ' : ouvrir pour les traiter'">
        <span class="nr-bell" aria-hidden="true"><lucide-icon name="bell-ring" [size]="20" /></span>
        <span class="nr-head">
          <span class="nr-title">{{ title() }}</span>
          <span class="nr-sub">en attente depuis au moins un jour</span>
        </span>
        <span class="nr-ticker" aria-hidden="true">
          <span class="nr-track" [class.nr-static]="reminders().length === 1" [style.animation-duration.s]="duration()">
            @for (pass of passes(); track pass) {
              @for (r of reminders(); track r.memberId) {
                <span class="nr-item">
                  <span class="nr-code">{{ r.code }}</span>
                  <span class="nr-name">{{ r.name }}</span>
                  <span class="nr-text">{{ r.notes }}</span>
                  <span class="nr-age">{{ late(r) }}</span>
                </span>
              }
            }
          </span>
        </span>
        <span class="nr-cta">Traiter <lucide-icon name="arrow-right" [size]="16" /></span>
      </button>
    }
  `,
  styles: `
    :host { display: block; }
    .nr-banner {
      --nr-accent: var(--warn);
      position: relative; display: flex; align-items: center; gap: 14px; width: 100%; margin: 0 0 14px; padding: 10px 14px 10px 10px;
      border: 1px solid color-mix(in srgb, var(--nr-accent) 35%, transparent); border-radius: 16px; cursor: pointer; overflow: hidden;
      font: inherit; color: var(--ink); text-align: left; isolation: isolate;
      background:
        radial-gradient(120% 180% at 0% 0%, color-mix(in srgb, var(--nr-accent) 22%, transparent), transparent 55%),
        linear-gradient(100deg, color-mix(in srgb, var(--nr-accent) 10%, var(--card)), color-mix(in srgb, var(--brand) 8%, var(--card)));
      box-shadow: 0 6px 24px -12px color-mix(in srgb, var(--nr-accent) 60%, transparent);
      transition: transform .2s ease, box-shadow .2s ease;
    }
    /* a light sweep crossing the banner */
    .nr-banner::after {
      content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
      background: linear-gradient(100deg, transparent 30%, color-mix(in srgb, #fff 35%, transparent) 50%, transparent 70%);
      transform: translateX(-100%); animation: nr-sheen 6s ease-in-out infinite;
    }
    .nr-banner:hover { transform: translateY(-1px); box-shadow: 0 10px 30px -12px color-mix(in srgb, var(--nr-accent) 70%, transparent); }
    .nr-banner:hover .nr-track, .nr-banner:focus-visible .nr-track { animation-play-state: paused; }
    .nr-bell {
      position: relative; flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px;
      color: #fff; background: linear-gradient(135deg, var(--nr-accent), var(--brand));
    }
    .nr-bell::before {
      content: ''; position: absolute; inset: -4px; border-radius: 15px; border: 2px solid var(--nr-accent); opacity: 0;
      animation: nr-pulse 2s ease-out infinite;
    }
    .nr-bell lucide-icon { animation: nr-ring 2.4s ease-in-out infinite; transform-origin: 50% 10%; }
    .nr-head { flex: none; display: flex; flex-direction: column; line-height: 1.2; }
    .nr-title { font-weight: 700; }
    .nr-sub { font-size: 12px; color: var(--muted); }
    .nr-ticker {
      flex: 1; min-width: 0; overflow: hidden;
      mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
    }
    .nr-track { display: inline-flex; gap: 10px; white-space: nowrap; animation: nr-scroll linear infinite; }
    .nr-track.nr-static { animation: none; }
    .nr-item {
      display: inline-flex; align-items: center; gap: 8px; max-width: 420px; padding: 5px 10px; border-radius: 999px;
      background: color-mix(in srgb, var(--card) 80%, transparent); border: 1px solid var(--line);
      backdrop-filter: blur(6px); font-size: 13px;
    }
    .nr-code { font-weight: 700; color: var(--brand); }
    .nr-name { font-weight: 600; }
    .nr-text { overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
    .nr-age { flex: none; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; color: var(--warn); background: var(--warn-bg); }
    .nr-cta {
      flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px; font-weight: 600;
      color: var(--on-brand, #fff); background: var(--brand); transition: gap .2s ease;
    }
    .nr-banner:hover .nr-cta { gap: 10px; }
    @keyframes nr-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes nr-sheen { 0%, 60% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
    @keyframes nr-pulse { 0% { opacity: .7; transform: scale(.9); } 100% { opacity: 0; transform: scale(1.25); } }
    @keyframes nr-ring { 0%, 50%, 100% { transform: rotate(0); } 5%, 15% { transform: rotate(14deg); } 10%, 20% { transform: rotate(-14deg); } 25% { transform: rotate(0); } }
    .nr-in { animation: nr-drop .45s cubic-bezier(.2, .9, .3, 1.2); }
    @keyframes nr-drop { from { opacity: 0; transform: translateY(-10px) scale(.98); } }
    @media (max-width: 720px) { .nr-head { display: none; } }
    @media (prefers-reduced-motion: reduce) {
      .nr-in, .nr-track, .nr-banner::after, .nr-bell::before, .nr-bell lucide-icon { animation: none; }
      .nr-ticker { overflow-x: auto; }
    }
  `,
})
export class NoteReminders {
  /** Reloaded whenever this changes (the members list was reloaded: a note may have been written or cleared). */
  refresh = input<unknown>();
  /** Notes were treated: the members list must be reloaded (and with it, this reminder). */
  changed = output<void>();

  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private config = inject(ConfigService);
  reminders = signal<NoteReminder[]>([]);
  title = computed(() => {
    const n = this.reminders().length;
    return n > 1 ? `${n} notes à traiter` : '1 note à traiter';
  });
  /** The list twice in a row, so that scrolling by half of it loops without a jump. */
  passes = computed(() => (this.reminders().length > 1 ? [0, 1] : [0]));
  duration = computed(() => Math.max(18, this.reminders().length * 7));

  constructor() {
    effect(() => {
      this.refresh();
      untracked(() => this.load());
    });
  }

  late(r: NoteReminder): string {
    return lateLabel(r, this.config.config()?.today ?? '');
  }

  async load(): Promise<void> {
    try {
      this.reminders.set(await this.api.noteReminders());
    } catch {
      this.reminders.set([]);
    }
  }

  async open(): Promise<void> {
    const done = await firstValueFrom(this.dialog.open(NoteRemindersDialog, { data: this.reminders(), width: '720px', maxWidth: '96vw' })
      .afterClosed());
    // the page reloads its members, which reloads this reminder through refresh
    if (done) this.changed.emit();
  }
}

/** For each late note: treated (the note is cleared) or to recall tomorrow (kept, hidden from the reminder until then). */
@Component({
  selector: 'app-note-reminders-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, LucideAngularModule, FrDatePipe],
  template: `
    <h2 mat-dialog-title>Notes à traiter</h2>
    <mat-dialog-content>
      <div class="nrd-bar">
        <span class="muted small">« Traité » supprime la note de l’adhérent ; « À relancer demain » la garde et la rappelle demain.</span>
        <span class="grow"></span>
        <button mat-button type="button" (click)="all('DONE')"><lucide-icon name="check-check" [size]="16" /> Tout traité</button>
        <button mat-button type="button" (click)="all('LATER')"><lucide-icon name="alarm-clock" [size]="16" /> Tout relancer</button>
      </div>
      <ul class="nrd-list">
        @for (r of d; track r.memberId) {
          <li class="nrd-item" [class.done]="choices()[r.memberId] === 'DONE'" [class.later]="choices()[r.memberId] === 'LATER'">
            <div class="nrd-who">
              <span class="nrd-code">{{ r.code }}</span><span class="strong">{{ r.name }}</span>
              <span class="nrd-age" [title]="r.notesUpdatedOn ? 'Écrite le ' + (r.notesUpdatedOn | frDate) : ''">{{ late(r) }}</span>
            </div>
            <p class="nrd-note">{{ r.notes }}</p>
            <mat-button-toggle-group [ngModel]="choices()[r.memberId]" (ngModelChange)="choose(r.memberId, $event)"
                                     [attr.aria-label]="'Suite à donner à la note de ' + r.code">
              <mat-button-toggle value="DONE"><lucide-icon name="circle-check" [size]="16" /> Traité</mat-button-toggle>
              <mat-button-toggle value="LATER"><lucide-icon name="alarm-clock" [size]="16" /> À relancer demain</mat-button-toggle>
            </mat-button-toggle-group>
          </li>
        }
      </ul>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Fermer</button>
      <button mat-flat-button type="button" (click)="save()" [disabled]="busy() || !count()">Enregistrer{{ count() ? ' (' + count() + ')' : '' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .nrd-bar { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
    .nrd-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .nrd-item {
      padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line); border-left: 4px solid var(--warn);
      background: var(--card); transition: border-color .2s ease, background .2s ease;
    }
    .nrd-item.done { border-left-color: var(--ok); background: color-mix(in srgb, var(--ok) 6%, var(--card)); }
    .nrd-item.later { border-left-color: var(--info, var(--brand)); background: color-mix(in srgb, var(--info, var(--brand)) 6%, var(--card)); }
    .nrd-who { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .nrd-code { font-weight: 700; color: var(--brand); }
    .nrd-age { margin-left: auto; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; color: var(--warn); background: var(--warn-bg); }
    .nrd-note { margin: 6px 0 10px; white-space: pre-wrap; color: var(--ink); }
  `,
})
export class NoteRemindersDialog {
  d = inject<NoteReminder[]>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<NoteRemindersDialog>);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  choices = signal<Record<number, NoteReminderChoice>>({});
  count = computed(() => Object.keys(this.choices()).length);
  busy = signal(false);
  error = signal('');

  late(r: NoteReminder): string {
    return lateLabel(r, this.config.config()?.today ?? '');
  }

  choose(memberId: number, choice: NoteReminderChoice): void {
    this.choices.update((c) => ({ ...c, [memberId]: choice }));
  }

  all(choice: NoteReminderChoice): void {
    this.choices.set(Object.fromEntries(this.d.map((r) => [r.memberId, choice])));
  }

  async save(): Promise<void> {
    const actions = this.d.filter((r) => this.choices()[r.memberId]).map((r) => ({ memberId: r.memberId, action: this.choices()[r.memberId] }));
    if (!actions.length) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.treatNoteReminders(actions);
      const done = actions.filter((a) => a.action === 'DONE').length;
      const later = actions.length - done;
      this.notify.success([done ? `${done} note${done > 1 ? 's' : ''} traitée${done > 1 ? 's' : ''}` : '',
        later ? `${later} à relancer demain` : ''].filter(Boolean).join(', ') + '.');
      this.ref.close(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
