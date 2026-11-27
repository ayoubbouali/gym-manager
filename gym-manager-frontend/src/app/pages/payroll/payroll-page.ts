import { Component, DestroyRef, computed, inject, signal, viewChildren } from '@angular/core';
import { CdkConnectedOverlay } from '@angular/cdk/overlay';
import { RouterLink } from '@angular/router';
import { FormsModule, NgModel } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { FrDatePipe, MoneyPipe, PAYMENT_METHODS, PAYMENT_STATUS_LABELS, formatDate, monthName, openPdf } from '../../core/format';
import { PaymentMethod, PayrollMonth, PayrollRow, SalaryPaymentView } from '../../core/models';
import { NotifyService, errorMessage } from '../../core/notify.service';
import { ActiveBadge, PaidBadge } from '../../shared/badges';
import { ConfirmService } from '../../shared/confirm.service';
import { DateField } from '../../shared/date-field';
import { hasInvalid, salaryReceiptUrl } from '../../shared/payment-dialogs';
import { PREVIEW_DELAY_MS, PREVIEW_POSITIONS } from '../members/members-page';
import { SalaryDetailDialog } from '../staff/staff-dialogs';
import { StaffPreview } from '../staff/staff-preview';

/** A month is paid once it has a non-cancelled pay slip. */
const isPaid = (r: PayrollRow) => r.paidOn !== null;
const activeSlips = (r: PayrollRow) => r.payments.filter((p) => !p.cancelled);

/** Adds, changes or removes the bonus of a month that is not paid yet. */
@Component({
  selector: 'app-salary-bonus-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ d.row.bonus > 0 ? 'Modifier la prime' : 'Ajouter une prime' }} — {{ d.row.staff.name }} · {{ month }}</h2>
    <mat-dialog-content>
      <form id="bonus-form" class="stack" (ngSubmit)="save()">
        <mat-form-field class="w-full"><mat-label>Montant de la prime</mat-label>
          <input matInput type="number" min="0.01" step="0.01" name="amount" [(ngModel)]="amount" required cdkFocusInitial />
          <span matTextSuffix>&nbsp;{{ currency() }}</span><mat-hint>Versée avec le salaire du mois, sur la même facture</mat-hint></mat-form-field>
        <mat-form-field class="w-full"><mat-label>Note (facultatif)</mat-label><input matInput name="note" [(ngModel)]="note" maxlength="500" /></mat-form-field>
      </form>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (d.row.bonus > 0) {<button mat-button type="button" class="btn-outline-danger" (click)="remove()" [disabled]="busy()">Retirer la prime</button>}
      <span class="grow"></span>
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="bonus-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
})
export class SalaryBonusDialog {
  d = inject<{ row: PayrollRow; period: string }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<SalaryBonusDialog>);
  currency = inject(ConfigService).currency;
  month = monthName(this.d.period);
  amount: number | null = this.d.row.bonus > 0 ? this.d.row.bonus : null;
  note = this.d.row.bonusNote ?? '';
  busy = signal(false);
  error = signal('');
  private controls = viewChildren(NgModel);

  save(): Promise<void> {
    if (hasInvalid(this.controls())) return Promise.resolve();
    return this.submit(this.amount);
  }

  remove(): Promise<void> {
    return this.submit(null);
  }

  private async submit(amount: number | null): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.ref.close(await this.api.salaryBonus(this.d.row.staff.id, this.d.period, amount, amount === null ? '' : this.note));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Pays the month in one go: salary + bonus, one pay slip. */
@Component({
  selector: 'app-salary-pay-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, DateField, MoneyPipe],
  template: `
    <h2 mat-dialog-title>Verser le salaire — {{ d.row.staff.name }} · {{ month }}</h2>
    <mat-dialog-content>
      <dl class="pay-recap">
        <dt>Salaire du personnel</dt><dd>{{ d.row.salary | money }}</dd>
        <dt>Prime</dt><dd>{{ d.row.bonus | money }}</dd>
        <dt>Total versé</dt><dd class="strong">{{ d.row.due | money }}</dd>
      </dl>
      <form id="salary-form" class="form-grid" (ngSubmit)="save()">
        <app-date-field label="Date du versement" name="paidOn" [(ngModel)]="paidOn" [max]="today" required />
        <div class="field-block">
          <span class="field-label">Mode de paiement</span>
          <mat-button-toggle-group name="method" [(ngModel)]="method" aria-label="Mode de paiement">
            @for (m of methods; track m.value) {<mat-button-toggle [value]="m.value">{{ m.label }}</mat-button-toggle>}
          </mat-button-toggle-group>
        </div>
        <mat-form-field class="span-2"><mat-label>Note (facultatif)</mat-label><input matInput name="note" [(ngModel)]="note" maxlength="500" /></mat-form-field>
      </form>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="salary-form" [disabled]="busy()">Enregistrer le versement</button>
    </mat-dialog-actions>
  `,
})
export class SalaryPayDialog {
  d = inject<{ row: PayrollRow; period: string }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<SalaryPayDialog>);
  private config = inject(ConfigService);
  methods = PAYMENT_METHODS;
  today = this.config.config()?.today ?? new Date().toISOString().slice(0, 10);
  month = monthName(this.d.period);
  paidOn = this.today;
  method: PaymentMethod = 'VIREMENT';
  note = '';
  busy = signal(false);
  error = signal('');
  private controls = viewChildren(NgModel);

  async save(): Promise<void> {
    if (hasInvalid(this.controls())) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.ref.close(await this.api.post<SalaryPaymentView>('/payroll/payments', {
        staffId: this.d.row.staff.id, period: this.d.period, method: this.method, paidOn: this.paidOn, note: this.note,
      }));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
import { Pager, Paged } from '../../shared/table';

@Component({
  selector: 'app-payroll',
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatTooltipModule, LucideAngularModule, CdkConnectedOverlay,
    DateField, Pager, MoneyPipe, FrDatePipe, PaidBadge, ActiveBadge, StaffPreview],
  template: `
    <div class="toolbar">
      <button class="icon-btn" (click)="shift(-1)" aria-label="Mois précédent"><lucide-icon name="chevron-left" /></button>
      <app-date-field mode="month" label="Mois" subscriptSizing="dynamic" [ngModel]="month()" (ngModelChange)="pickMonth($event)" [max]="currentMonth" />
      <button class="icon-btn" (click)="shift(1)" [disabled]="month() >= currentMonth" aria-label="Mois suivant"><lucide-icon name="chevron-right" /></button>
      <h2 class="month-title">{{ title() }}</h2>
      <span class="grow"></span>
      @if (data(); as d) {<span class="muted">Commissions sur les adhérents en cours ce mois-ci · nouveaux inscrits comptés : du {{ d.from | frDate }} au {{ d.to | frDate }}</span>}
      <button mat-stroked-button (click)="csv()"><lucide-icon name="download" [size]="16" /> CSV</button>
    </div>

    @if (data(); as d) {
      <div class="kpis">
        <div class="kpi-card"><span class="kpi-icon blue"><lucide-icon name="briefcase" /></span>
          <span><span class="kpi-label">Masse salariale du mois</span><span class="kpi-value">{{ d.totalDue | money }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon green"><lucide-icon name="circle-check" /></span>
          <span><span class="kpi-label">Déjà versé</span><span class="kpi-value">{{ d.totalPaid | money }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon red"><lucide-icon name="hourglass" /></span>
          <span><span class="kpi-label">Reste à verser</span><span class="kpi-value" [class.red]="d.totalBalance > 0">{{ d.totalBalance | money }}</span></span></div>
      </div>

      <div class="table-wrap">
        <table class="table compact">
          <thead><tr>
            <th>ID</th><th>Personnel</th><th class="num">Salaire du personnel</th><th class="num">Prime</th>
            <th>Statut</th><th>Date de paiement</th><th>Facture</th><th><span class="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            @for (r of rows.page(); track r.staff.id) {
              <tr [class.inactive]="!r.staff.active">
                <td><a class="code-link" [routerLink]="['/personnel/fiche', r.staff.code]" [attr.aria-describedby]="preview()?.row?.staff?.id === r.staff.id ? previewId : null"
                       (mouseenter)="openPreview(r, $event)" (focus)="openPreview(r, $event)" (mouseleave)="closePreview()" (blur)="closePreview()" (keydown.escape)="closePreview()">{{ r.staff.code }}</a></td>
                <td class="strong">{{ r.staff.name }} @if (!r.staff.active) {<app-active-badge [active]="false" />}<div class="muted small">{{ r.staff.function?.label }}</div></td>
                <td class="num">
                  @if (r.staff.payMode === 'COMMISSION') {
                    <button class="link-btn strong" (click)="detail(r)" matTooltip="Détail du calcul" [attr.aria-label]="'Détail du salaire de ' + r.staff.name">{{ r.salary | money }} <lucide-icon name="info" [size]="14" /></button>
                  } @else {<span class="strong">{{ r.salary | money }}</span>}
                </td>
                <td class="num">
                  @if (paid(r)) {
                    @if (r.bonus > 0) {<span [matTooltip]="r.bonusNote ?? ''">{{ r.bonus | money }}</span>} @else {<span class="muted">—</span>}
                  } @else if (r.bonus > 0) {
                    <span class="bonus-cell"><span [matTooltip]="r.bonusNote ?? ''">{{ r.bonus | money }}</span>
                      <button class="icon-btn" (click)="bonus(r)" matTooltip="Modifier la prime" [attr.aria-label]="'Modifier la prime de ' + r.staff.name"><lucide-icon name="pencil" [size]="14" /></button></span>
                  } @else {
                    <button class="icon-btn" (click)="bonus(r)" matTooltip="Ajouter une prime" [attr.aria-label]="'Ajouter une prime à ' + r.staff.name"><lucide-icon name="plus" [size]="16" /></button>
                  }
                </td>
                <td>@if (r.due === 0 && !paid(r)) {<span class="badge neutral">Rien à verser</span>} @else {<app-paid-badge [value]="r.status" />}</td>
                <td>{{ r.paidOn ? (r.paidOn | frDate) : '—' }}</td>
                <td class="wrap slips">
                  @for (p of slips(r); track p.id) {
                    <button class="chip chip-btn receipt-chip" (click)="open(p)" [matTooltip]="p.methodLabel + ' · ' + (p.amount | money) + (p.note ? ' · ' + p.note : '')"
                            [attr.aria-label]="'Facture ' + p.slipNumber + ' (PDF)'"><lucide-icon name="file-text" [size]="12" /> {{ p.slipNumber }}</button>
                  } @empty {<span class="muted">—</span>}
                </td>
                <td class="actions">
                  @if (paid(r)) {
                    <button mat-stroked-button class="sm pay-action btn-outline-danger" (click)="cancel(r)" [attr.aria-label]="'Annuler le versement de ' + r.staff.name">Annuler</button>
                  } @else {
                    <button mat-flat-button class="sm pay-action" (click)="pay(r)" [disabled]="r.due <= 0">Verser</button>
                  }
                </td>
              </tr>
            } @empty {<tr><td colspan="8" class="empty">Aucun membre du personnel actif.</td></tr>}
          </tbody>
        </table>
      </div>
      <app-pager [table]="rows" />
      @if (preview(); as p) {
        <ng-template cdkConnectedOverlay [cdkConnectedOverlayOpen]="true" [cdkConnectedOverlayOrigin]="p.origin"
                     [cdkConnectedOverlayPositions]="previewPositions" [cdkConnectedOverlayPush]="true" [cdkConnectedOverlayViewportMargin]="8"
                     cdkConnectedOverlayPanelClass="member-preview-pane" (detach)="closePreview()">
          <app-staff-preview [id]="previewId" [staff]="p.row.staff" [salary]="p.row.salary" [month]="d.period" />
        </ng-template>
      }
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
})
export class PayrollPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  currentMonth = (this.config.config()?.today ?? new Date().toISOString()).slice(0, 7);
  month = signal(this.currentMonth);
  data = signal<PayrollMonth | null>(null);
  rows = new Paged(() => this.data()?.rows ?? [], () => this.config.pageSize());
  title = computed(() => `Paie de ${monthName(this.month())}`);
  readonly paid = isPaid;
  readonly slips = activeSlips;

  readonly previewId = 'staff-preview';
  readonly previewPositions = PREVIEW_POSITIONS;
  preview = signal<{ row: PayrollRow; origin: HTMLElement } | null>(null);
  private previewTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.previewTimer));
    this.load();
  }

  async load(): Promise<void> {
    if (!this.month()) return;
    // a reloaded row never fires mouseleave
    this.closePreview();
    try {
      this.data.set(await this.api.payroll(this.month()));
    } catch (e) {
      this.notify.error(e);
    }
  }

  openPreview(r: PayrollRow, event: Event): void {
    const origin = event.currentTarget as HTMLElement;
    clearTimeout(this.previewTimer);
    // On focus, open at once so screen readers announce the description.
    if (event.type === 'focus') this.preview.set({ row: r, origin });
    else this.previewTimer = setTimeout(() => this.preview.set({ row: r, origin }), PREVIEW_DELAY_MS);
  }

  closePreview(): void {
    clearTimeout(this.previewTimer);
    this.preview.set(null);
  }

  /** Typed or picked month; an incomplete or invalid entry (null) keeps the current month. */
  pickMonth(value: string | null): void {
    if (!value || value === this.month() || value > this.currentMonth) return;
    this.month.set(value);
    this.load();
  }

  shift(delta: number): void {
    const [y, m] = this.month().split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (next > this.currentMonth) return;
    this.month.set(next);
    this.load();
  }

  detail(r: PayrollRow): void {
    this.dialog.open(SalaryDetailDialog, { data: { ...r.staff, salary: r.salary, salaryDetail: r.detail }, width: '720px', maxWidth: '96vw' });
  }

  async bonus(r: PayrollRow): Promise<void> {
    const row = await firstValueFrom(this.dialog.open(SalaryBonusDialog, { data: { row: r, period: this.month() }, width: '480px', maxWidth: '96vw' }).afterClosed());
    if (row) {
      this.notify.success(row.bonus > 0 ? `Prime de ${r.staff.name} enregistrée.` : `Prime de ${r.staff.name} retirée.`);
      this.load();
    }
  }

  async pay(r: PayrollRow): Promise<void> {
    const p = await firstValueFrom(this.dialog.open(SalaryPayDialog, { data: { row: r, period: this.month() }, width: '600px', maxWidth: '96vw' }).afterClosed());
    if (p) {
      this.notify.successWithAction(`Versement enregistré — facture ${p.slipNumber}.`, 'Voir la facture', () => openPdf(salaryReceiptUrl(p)));
      this.load();
    }
  }

  async cancel(r: PayrollRow): Promise<void> {
    const numbers = activeSlips(r).map((p) => p.slipNumber).join(', ');
    const ok = await this.confirm.confirm({
      title: `Annuler le versement de ${monthName(this.month())} — ${r.staff.name} ?`,
      message: `La facture ${numbers} sera supprimée définitivement : le mois redevient impayé${r.bonus > 0 ? ', la prime est conservée' : ''}. `
        + 'Le numéro de facture ne sera pas réutilisé.',
      confirmLabel: 'Annuler le versement', danger: true,
    });
    if (!ok) return;
    try {
      await this.api.resetPayrollMonth(r.staff.id, this.month());
      this.notify.success(`Versement de ${r.staff.name} annulé.`);
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  open(p: SalaryPaymentView): void {
    openPdf(salaryReceiptUrl(p));
  }

  csv(): void {
    exportCsv(`paie-${this.month()}`, [
      { header: 'ID', value: (r) => r.staff.code }, { header: 'Personnel', value: (r) => r.staff.name },
      { header: 'Fonction', value: (r) => r.staff.function?.label ?? '' },
      { header: 'Salaire du personnel', value: (r) => csvNumber(r.salary) }, { header: 'Prime', value: (r) => csvNumber(r.bonus) },
      { header: 'Total', value: (r) => csvNumber(r.due) }, { header: 'Statut', value: (r) => (r.due === 0 && !isPaid(r) ? 'Rien à verser' : PAYMENT_STATUS_LABELS[r.status]) },
      { header: 'Date de paiement', value: (r) => (r.paidOn ? formatDate(r.paidOn) : '') },
      { header: 'Facture', value: (r) => activeSlips(r).map((p) => p.slipNumber).join(', ') },
    ], this.data()?.rows ?? []);
  }
}
