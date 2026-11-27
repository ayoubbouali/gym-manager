import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { FrDatePipe, MoneyPipe, monthName, openPdf } from '../../core/format';
import { SalaryPaymentView, StaffView } from '../../core/models';
import { SportChip } from '../../shared/badges';
import { salaryReceiptUrl } from '../../shared/payment-dialogs';
import { SalaryDetailDialog } from './staff-dialogs';
import { payModeLabel, staffInitials } from './staff-preview';
import { Pager, Paged } from '../../shared/table';

/** Staff card: identity, coached sports, pay mode, salary of the current month and pay slip history. */
@Component({
  selector: 'app-staff-card',
  imports: [RouterLink, MatButtonModule, MatTooltipModule, LucideAngularModule, SportChip, Pager, MoneyPipe, FrDatePipe],
  template: `
    <div class="toolbar">
      <a mat-stroked-button routerLink="/paie"><lucide-icon name="chevron-left" [size]="16" /> Paie du personnel</a>
      <a mat-stroked-button routerLink="/personnel"><lucide-icon name="users" [size]="16" /> Personnel & coachs</a>
    </div>

    @if (staff(); as s) {
      <section class="card profile-card">
        <div class="profile-head">
          <h2>{{ s.code }} — {{ s.name }} @if (!s.active) {<span class="badge neutral">Inactif</span>}</h2>
        </div>
        <div class="profile">
          <div class="photo-col"><div class="photo initials" aria-hidden="true">{{ initials(s) }}</div></div>
          <div class="info-block">
            <h4>Identité</h4>
            <dl>
              <dt>Nom</dt><dd>{{ s.lastName }}</dd>
              <dt>Prénom</dt><dd>{{ s.firstName || '—' }}</dd>
              <dt>Téléphone</dt><dd>{{ s.phone || '—' }}</dd>
              <dt>Fonction</dt><dd>{{ s.function?.label ?? '—' }}</dd>
            </dl>
            <h4>Sports encadrés</h4>
            <p>@for (x of s.sports; track x.id) {<app-sport-chip [name]="x.name" [color]="x.color" [inactive]="!x.active" />} @empty {<span class="muted">Aucun</span>}</p>
          </div>
          <div class="info-block state">
            <h4>Rémunération</h4>
            <dl>
              <dt>Mode de paie</dt>
              <dd><span class="badge" [class.info]="s.payMode === 'FIXED'" [class.warn]="s.payMode === 'COMMISSION'" [class.neutral]="s.internal">{{ payModeLabel(s) }}</span></dd>
              @if (s.internal) {
                <dt>Salaire</dt><dd class="muted">Aucun : fait partie des propriétaires du club</dd>
              } @else {
                @if (s.payMode === 'FIXED') {<dt>Salaire fixe</dt><dd>{{ s.fixedSalary | money }}</dd>}
                <dt>Salaire de {{ month(s.salaryDetail.month) }}</dt>
                <dd>
                  <span class="strong">{{ s.salary | money }}</span>
                  @if (s.payMode === 'COMMISSION') {
                    <button class="link-btn" (click)="detail(s)" [attr.aria-label]="'Détail du calcul du salaire de ' + s.name"><lucide-icon name="info" [size]="14" /> Détail</button>
                  }
                </dd>
              }
            </dl>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h3>Historique des factures</h3></div>
        <table class="table compact">
          <thead><tr><th>Mois</th><th>Facture</th><th>Date de paiement</th><th>Mode</th><th class="num">Montant</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (p of historyRows.page(); track p.id) {
              <tr [class.cancelled]="p.cancelled">
                <td>{{ month(p.period) }}</td><td class="code">{{ p.slipNumber }}</td><td>{{ p.paidOn | frDate }}</td><td>{{ p.methodLabel }}</td>
                <td class="num strong">{{ p.amount | money }} @if (p.cancelled) {<span class="badge ko">annulé</span>}</td>
                <td class="actions"><button class="icon-btn" (click)="open(p)" matTooltip="Facture (PDF)" [attr.aria-label]="'Facture ' + p.slipNumber"><lucide-icon name="file-text" [size]="16" /></button></td>
              </tr>
            } @empty {<tr><td colspan="6" class="empty">Aucune facture.</td></tr>}
          </tbody>
        </table>
        <app-pager [table]="historyRows" [auto]="true" />
      </section>
    } @else if (notFound()) {
      <div class="card empty-state"><lucide-icon name="circle-alert" [size]="36" /><h2>Membre du personnel introuvable</h2><p class="muted">{{ notFound() }}</p></div>
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
})
export class StaffCardPage {
  code = input.required<string>();
  private api = inject(ApiService);
  private dialog = inject(MatDialog);

  staff = signal<StaffView | null>(null);
  history = signal<SalaryPaymentView[]>([]);
  historyRows = new Paged(() => this.history());
  payModeLabel = payModeLabel;
  notFound = signal('');
  readonly initials = staffInitials;
  month = (period: string) => monthName(period);

  constructor() {
    effect(() => this.load(this.code()));
  }

  private async load(code: string): Promise<void> {
    this.staff.set(null);
    this.notFound.set('');
    try {
      const s = (await this.api.staff()).rows.find((x) => x.code === code);
      if (!s) {
        this.notFound.set(`Aucun membre du personnel n'a l'ID « ${code} ».`);
        return;
      }
      this.history.set(await this.api.salaryHistory(s.id));
      this.staff.set(s);
    } catch (e: any) {
      this.notFound.set(e?.error?.message ?? 'Membre du personnel introuvable.');
    }
  }

  detail(s: StaffView): void {
    this.dialog.open(SalaryDetailDialog, { data: s, width: '720px', maxWidth: '96vw' });
  }

  open(p: SalaryPaymentView): void {
    openPdf(salaryReceiptUrl(p));
  }
}
