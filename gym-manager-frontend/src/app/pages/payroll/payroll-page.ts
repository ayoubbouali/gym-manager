import { Component, computed, inject, signal, viewChildren } from '@angular/core';
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
import { FrDatePipe, MoneyPipe, PAYMENT_METHODS, PAYMENT_STATUS_LABELS, monthName, openPdf } from '../../core/format';
import { PaymentMethod, PayrollMonth, PayrollRow, SalaryPaymentView } from '../../core/models';
import { NotifyService, errorMessage } from '../../core/notify.service';
import { ActiveBadge, PaidBadge } from '../../shared/badges';
import { DateField } from '../../shared/date-field';
import { cancelWithReason, hasInvalid, salaryReceiptUrl } from '../../shared/payment-dialogs';
import { SalaryDetailDialog } from '../staff/staff-dialogs';

/** Pay a salary or an advance for a month. */
@Component({
  selector: 'app-salary-pay-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, DateField, MoneyPipe],
  template: `
    <h2 mat-dialog-title>Verser le salaire — {{ d.row.staff.name }} · {{ month }}</h2>
    <mat-dialog-content>
      <p class="muted">Salaire du mois : <b>{{ d.row.due | money }}</b> · déjà versé : {{ d.row.paid | money }} · reste : <b>{{ d.row.balance | money }}</b></p>
      <form id="salary-form" class="form-grid" (ngSubmit)="save()">
        <mat-form-field><mat-label>Montant</mat-label><input matInput type="number" min="0.01" step="0.01" name="amount" [(ngModel)]="amount" required />
          <span matTextSuffix>&nbsp;{{ currency() }}</span><mat-hint>Moins que le reste = acompte</mat-hint></mat-form-field>
        <app-date-field label="Date du versement" name="paidOn" [(ngModel)]="paidOn" [max]="today" required />
        <div class="field-block span-2">
          <span class="field-label">Mode de paiement</span>
          <mat-button-toggle-group name="method" [(ngModel)]="method" aria-label="Mode de paiement">
            @for (m of methods; track m.value) {<mat-button-toggle [value]="m.value">{{ m.label }}</mat-button-toggle>}
          </mat-button-toggle-group>
        </div>
        <mat-form-field class="span-2"><mat-label>Note (facultatif)</mat-label><input matInput name="note" [(ngModel)]="note" maxlength="500" placeholder="Ex. : acompte, prime…" /></mat-form-field>
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
  currency = this.config.currency;
  methods = PAYMENT_METHODS;
  today = this.config.config()?.today ?? new Date().toISOString().slice(0, 10);
  month = monthName(`${this.d.period}-01`);
  amount: number | null = this.d.row.balance;
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
        staffId: this.d.row.staff.id, period: this.d.period, amount: this.amount, method: this.method, paidOn: this.paidOn, note: this.note,
      }));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** All salary payments of one staff member. */
@Component({
  selector: 'app-salary-history',
  imports: [MatDialogModule, MatButtonModule, MatTooltipModule, LucideAngularModule, MoneyPipe, FrDatePipe],
  template: `
    <h2 mat-dialog-title>Historique des salaires — {{ d.name }}</h2>
    <mat-dialog-content>
      <table class="table compact">
        <thead><tr><th>Mois</th><th>Reçu</th><th>Date</th><th>Mode</th><th class="num">Montant</th><th></th></tr></thead>
        <tbody>
          @for (p of d.rows; track p.id) {
            <tr [class.cancelled]="p.cancelled">
              <td>{{ month(p.period) }}</td><td class="code">{{ p.slipNumber }}</td><td>{{ p.paidOn | frDate }}</td><td>{{ p.methodLabel }}</td>
              <td class="num strong">{{ p.amount | money }} @if (p.cancelled) {<span class="badge ko">annulé</span>}</td>
              <td class="actions"><button class="icon-btn" (click)="open(p)" matTooltip="Reçu (PDF)" [attr.aria-label]="'Reçu ' + p.slipNumber"><lucide-icon name="file-text" [size]="16" /></button></td>
            </tr>
          } @empty {<tr><td colspan="6" class="empty">Aucun versement enregistré.</td></tr>}
        </tbody>
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-flat-button mat-dialog-close>Fermer</button></mat-dialog-actions>
  `,
})
export class SalaryHistoryDialog {
  d = inject<{ name: string; rows: SalaryPaymentView[] }>(MAT_DIALOG_DATA);
  month = (p: string) => monthName(`${p}-01`);
  open = (p: SalaryPaymentView) => openPdf(salaryReceiptUrl(p));
}

@Component({
  selector: 'app-payroll',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTooltipModule, LucideAngularModule, DateField, MoneyPipe, FrDatePipe, PaidBadge, ActiveBadge],
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
            <th>ID</th><th>Nom</th><th>Mode</th><th class="num">Salaire du mois</th><th class="num">Versé</th>
            <th class="num">Reste</th><th>Statut</th><th>Versements</th><th><span class="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            @for (r of d.rows; track r.staff.id) {
              <tr [class.inactive]="!r.staff.active">
                <td class="code">{{ r.staff.code }}</td>
                <td class="strong">{{ r.staff.name }} @if (!r.staff.active) {<app-active-badge [active]="false" />}<div class="muted small">{{ r.staff.function?.label }}</div></td>
                <td><span class="badge" [class.info]="r.staff.payMode === 'FIXED'" [class.warn]="r.staff.payMode === 'COMMISSION'">{{ r.staff.payMode === 'FIXED' ? 'Fixe' : 'Commission' }}</span></td>
                <td class="num">
                  @if (r.staff.payMode === 'COMMISSION') {
                    <button class="link-btn strong" (click)="detail(r)" matTooltip="Détail du calcul" [attr.aria-label]="'Détail du salaire de ' + r.staff.name">{{ r.due | money }} <lucide-icon name="info" [size]="14" /></button>
                  } @else {<span class="strong">{{ r.due | money }}</span>}
                </td>
                <td class="num">{{ r.paid | money }}</td>
                <td class="num" [class.red]="r.balance > 0">{{ r.balance | money }}</td>
                <td>@if (r.due === 0 && r.paid === 0) {<span class="badge neutral">Rien à verser</span>} @else {<app-paid-badge [value]="r.status" />}</td>
                <td class="wrap slips">
                  @for (p of r.payments; track p.id) {
                    <button class="chip chip-btn receipt-chip" [class.chip-inactive]="p.cancelled" (click)="open(p)" [matTooltip]="p.methodLabel + ' · ' + (p.paidOn | frDate) + (p.note ? ' · ' + p.note : '')">
                      <lucide-icon name="file-text" [size]="12" /> {{ p.slipNumber }} · {{ p.amount | money: 0 }}
                    </button>
                    @if (!p.cancelled) {<button class="icon-btn danger xs" (click)="cancel(p)" [attr.aria-label]="'Annuler ' + p.slipNumber" matTooltip="Annuler ce versement"><lucide-icon name="x" [size]="12" /></button>}
                  } @empty {<span class="muted">—</span>}
                </td>
                <td class="actions">
                  <button class="icon-btn" (click)="history(r)" matTooltip="Historique" [attr.aria-label]="'Historique de ' + r.staff.name"><lucide-icon name="history" [size]="16" /></button>
                  <button mat-flat-button class="sm" (click)="pay(r)" [disabled]="r.balance <= 0">Verser</button>
                </td>
              </tr>
            } @empty {<tr><td colspan="9" class="empty">Aucun membre du personnel actif.</td></tr>}
          </tbody>
        </table>
      </div>
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
})
export class PayrollPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  currentMonth = (this.config.config()?.today ?? new Date().toISOString()).slice(0, 7);
  month = signal(this.currentMonth);
  data = signal<PayrollMonth | null>(null);
  title = computed(() => `Paie de ${monthName(`${this.month()}-01`)}`);

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    if (!this.month()) return;
    try {
      this.data.set(await this.api.payroll(this.month()));
    } catch (e) {
      this.notify.error(e);
    }
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
    this.dialog.open(SalaryDetailDialog, { data: { ...r.staff, salary: r.due, salaryDetail: r.detail }, width: '720px', maxWidth: '96vw' });
  }

  async pay(r: PayrollRow): Promise<void> {
    const p = await firstValueFrom(this.dialog.open(SalaryPayDialog, { data: { row: r, period: this.month() }, width: '600px', maxWidth: '96vw' }).afterClosed());
    if (p) {
      this.notify.successWithAction(`Versement enregistré — reçu ${p.slipNumber}.`, 'Voir le reçu', () => openPdf(salaryReceiptUrl(p)));
      this.load();
    }
  }

  async cancel(p: SalaryPaymentView): Promise<void> {
    if (await cancelWithReason(this.dialog, `Annuler le versement ${p.slipNumber} ?`, (reason) => this.api.post(`/payroll/payments/${p.id}/cancel`, { reason }))) {
      this.notify.success(`Versement ${p.slipNumber} annulé.`);
      this.load();
    }
  }

  async history(r: PayrollRow): Promise<void> {
    const rows = await this.api.salaryHistory(r.staff.id);
    this.dialog.open(SalaryHistoryDialog, { data: { name: r.staff.name, rows }, width: '720px', maxWidth: '96vw' });
  }

  open(p: SalaryPaymentView): void {
    openPdf(salaryReceiptUrl(p));
  }

  csv(): void {
    exportCsv(`paie-${this.month()}`, [
      { header: 'ID', value: (r) => r.staff.code }, { header: 'Nom', value: (r) => r.staff.name },
      { header: 'Fonction', value: (r) => r.staff.function?.label ?? '' }, { header: 'Mode', value: (r) => (r.staff.payMode === 'FIXED' ? 'Fixe' : 'Commission') },
      { header: 'Salaire du mois', value: (r) => csvNumber(r.due) }, { header: 'Versé', value: (r) => csvNumber(r.paid) },
      { header: 'Reste', value: (r) => csvNumber(r.balance) }, { header: 'Statut', value: (r) => PAYMENT_STATUS_LABELS[r.status] },
      { header: 'Reçus', value: (r) => r.payments.filter((p) => !p.cancelled).map((p) => p.slipNumber).join(', ') },
    ], this.data()?.rows ?? []);
  }
}
