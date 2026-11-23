import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { FrDatePipe, FrDateTimePipe, MoneyPipe, formatDate, norm } from '../../core/format';
import { ActivityView, MemberCard, MemberView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ConfirmService } from '../../shared/confirm.service';
import { DaysLeft, PaidBadge, SportChip, StateBadge } from '../../shared/badges';
import { openMemberForm } from './member-form-dialog';
import { AuthService } from '../../core/auth.service';
import { openPdf } from '../../core/format';
import { PaymentView, SubscriptionView } from '../../core/models';
import { cancelWithReason, notifyReceipt, openPaymentDialog, openRenewDialog, receiptUrl } from '../../shared/payment-dialogs';

@Component({
  selector: 'app-member-card',
  imports: [RouterLink, FormsModule, MatAutocompleteModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatTooltipModule,
    LucideAngularModule, SportChip, PaidBadge, StateBadge, DaysLeft, MoneyPipe, FrDatePipe, FrDateTimePipe],
  template: `
    <div class="toolbar">
      <label class="search grow max-480">
        <lucide-icon name="search" [size]="18" />
        <input type="search" placeholder="ID, nom ou prénom…" aria-label="Rechercher un adhérent"
               [ngModel]="query()" (ngModelChange)="query.set($event)" [matAutocomplete]="auto" />
      </label>
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="open($event.option.value)">
        @for (m of suggestions(); track m.id) {
          <mat-option [value]="m.code"><b>{{ m.code }}</b> · {{ m.firstName }} {{ m.lastName }} <small class="muted">{{ m.phone }}</small></mat-option>
        }
      </mat-autocomplete>
      <button mat-flat-button (click)="add()"><lucide-icon name="user-plus" [size]="16" /> Nouvel adhérent</button>
    </div>

    @if (card(); as c) {
      <section class="card profile-card">
        <div class="profile-head">
          <h2>{{ c.member.code }} — {{ c.member.firstName }} {{ c.member.lastName.toUpperCase() }}
            @if (!c.member.active) {<span class="badge neutral">Désactivé</span>}
          </h2>
          <span class="grow"></span>
          @if (c.whatsappLink) {
            <a mat-flat-button class="btn-wa" [href]="c.whatsappLink" target="_blank" rel="noopener" [matTooltip]="c.alertMessage ?? ''">
              <lucide-icon name="message-circle" [size]="16" /> WhatsApp
            </a>
          }
          <button mat-stroked-button (click)="edit(c.member)"><lucide-icon name="pencil" [size]="16" /> Modifier</button>
          <button mat-stroked-button class="btn-outline-danger" (click)="remove(c.member)"><lucide-icon name="trash-2" [size]="16" /> Supprimer</button>
        </div>
        <div class="profile">
          <div class="photo-col">
            @if (c.member.hasPhoto) {
              <img class="photo" [src]="photoUrl()" [alt]="'Photo de ' + c.member.firstName + ' ' + c.member.lastName" />
            } @else {
              <div class="photo initials" aria-hidden="true">{{ c.member.firstName[0] }}{{ c.member.lastName[0] }}</div>
            }
            <label class="photo-btn" mat-stroked-button>
              <lucide-icon name="camera" [size]="16" /> {{ c.member.hasPhoto ? 'Changer la photo' : 'Ajouter une photo' }}
              <input type="file" accept="image/jpeg,image/png" (change)="upload($event)" class="sr-only" />
            </label>
            @if (c.member.hasPhoto) {<button class="link-btn danger" (click)="removePhoto()">Retirer la photo</button>}
          </div>
          <div class="info-block">
            <h4>Identité</h4>
            <dl>
              <dt>Nom</dt><dd>{{ c.member.lastName }}</dd>
              <dt>Prénom</dt><dd>{{ c.member.firstName }}</dd>
              <dt>Téléphone</dt><dd>{{ c.member.phone }}</dd>
              <dt>Né(e) le</dt><dd>{{ c.member.birthDate | frDate }}</dd>
            </dl>
            <h4>Abonnement</h4>
            <dl>
              <dt>Sport(s)</dt><dd>@for (s of c.member.sports; track s.id) {<app-sport-chip [name]="s.name" [color]="s.color" />}</dd>
              <dt>Inscrit le</dt><dd>{{ c.member.registrationDate | frDate }}</dd>
              <dt>Abonnement</dt><dd>{{ c.member.pack?.name ?? '—' }}</dd>
              <dt>Remise</dt><dd>{{ c.member.discount?.name ?? '—' }}</dd>
              <dt>Prix</dt><dd class="strong">{{ c.member.price | money }}</dd>
            </dl>
          </div>
          <div class="info-block state">
            <h4>État</h4>
            <dl>
              <dt>Statut paiement</dt><dd><app-paid-badge [value]="c.member.paymentStatus" /></dd>
              <dt>Déjà payé</dt><dd>{{ c.member.paid | money }}</dd>
              <dt>Reste à payer</dt><dd [class.red]="c.member.balance > 0">{{ c.member.balance | money }}</dd>
              <dt>Reste de jours</dt><dd><app-days [days]="c.member.remainingDays" /></dd>
              <dt>État</dt><dd><app-state-badge [member]="c.member" /></dd>
              <dt>Assurance</dt><dd><app-paid-badge [value]="c.member.insurance" /></dd>
            </dl>
            @if (c.member.notes) {<h4>Notes</h4><p class="notes">{{ c.member.notes }}</p>}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Abonnement & paiements</h3>
          <span class="grow"></span>
          @if (c.subscriptions.length) {
            <button mat-stroked-button (click)="renew(c)"><lucide-icon name="refresh-cw" [size]="16" /> Renouveler</button>
            <button mat-flat-button (click)="pay(c)" [disabled]="c.member.balance <= 0"><lucide-icon name="wallet" [size]="16" /> Encaisser</button>
          } @else {
            <button mat-flat-button (click)="renew(c)"><lucide-icon name="plus" [size]="16" /> Nouvel abonnement</button>
          }
        </div>
        @for (s of c.subscriptions; track s.id) {
          <div class="period" [class.current]="s.current">
            <div class="period-head">
              <div>
                <b>{{ s.packName }}</b> @if (s.current) {<span class="badge info">en cours</span>}
                <div class="muted small">du {{ s.startDate | frDate }} au {{ s.endDate | frDate }} · {{ s.discountName }}</div>
              </div>
              <span class="grow"></span>
              <div class="period-amounts">
                <span>{{ s.amount | money }}</span>
                <small class="muted">payé {{ s.paid | money }} · reste <b [class.red]="s.balance > 0">{{ s.balance | money }}</b></small>
              </div>
              <app-paid-badge [value]="s.paymentStatus" />
              @if (admin() && !s.payments.length) {
                <button class="icon-btn danger" (click)="cancelRenewal(c, s)" matTooltip="Supprimer cette période" aria-label="Supprimer cette période"><lucide-icon name="trash-2" [size]="16" /></button>
              }
            </div>
            @if (s.payments.length) {
              <table class="table compact">
                <thead><tr><th>Reçu</th><th>Date</th><th>Mode</th><th class="num">Montant</th><th>Encaissé par</th><th><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  @for (p of s.payments; track p.id) {
                    <tr [class.cancelled]="p.cancelled">
                      <td class="code">{{ p.receiptNumber }}</td>
                      <td>{{ p.paidOn | frDate }}</td>
                      <td>{{ p.methodLabel }}</td>
                      <td class="num strong">{{ p.amount | money }}</td>
                      <td class="muted">{{ p.createdBy }} @if (p.cancelled) {<span class="badge ko" [matTooltip]="p.cancelReason ?? ''">annulé</span>}</td>
                      <td class="actions">
                        <button class="icon-btn" (click)="openReceipt(p)" matTooltip="Voir le reçu (PDF)" [attr.aria-label]="'Reçu ' + p.receiptNumber"><lucide-icon name="file-text" [size]="16" /></button>
                        @if (admin() && !p.cancelled) {
                          <button class="icon-btn" (click)="editPayment(c, p)" matTooltip="Modifier" [attr.aria-label]="'Modifier ' + p.receiptNumber"><lucide-icon name="pencil" [size]="16" /></button>
                          <button class="icon-btn danger" (click)="cancelPayment(p)" matTooltip="Annuler le paiement" [attr.aria-label]="'Annuler ' + p.receiptNumber"><lucide-icon name="ban" [size]="16" /></button>
                        }
                        @if (admin() && p.cancelled) {
                          <button class="icon-btn danger" (click)="deletePayment(p)" matTooltip="Supprimer de l'historique" [attr.aria-label]="'Supprimer ' + p.receiptNumber"><lucide-icon name="trash-2" [size]="16" /></button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="muted small no-pay">Aucun paiement sur cette période.</p>
            }
          </div>
        } @empty {
          <p class="muted">Aucun abonnement.</p>
        }
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Activités</h3>
          <span class="grow"></span>
          <mat-form-field subscriptSizing="dynamic" class="w-280">
            <mat-label>Inscrire à une activité</mat-label>
            <mat-select [(ngModel)]="activityToAdd">
              @for (a of availableActivities(); track a.id) {
                <mat-option [value]="a.id" [disabled]="a.full">{{ a.name }} — {{ a.startsAt | frDateTime }}{{ a.full ? ' (complète)' : '' }}</mat-option>
              } @empty {<mat-option disabled>Aucune activité disponible</mat-option>}
            </mat-select>
          </mat-form-field>
          <button mat-flat-button (click)="register()" [disabled]="!activityToAdd"><lucide-icon name="plus" [size]="16" /> Inscrire</button>
        </div>
        <table class="table compact">
          <tbody>
            @for (a of c.activities; track a.id) {
              <tr>
                <td class="strong">{{ a.name }}</td><td>{{ a.startsAt | frDateTime }}</td><td>{{ a.location || '—' }}</td>
                <td class="num">{{ a.price | money }}</td>
                <td class="actions"><button class="icon-btn danger" (click)="unregister(a)" [attr.aria-label]="'Désinscrire de ' + a.name" matTooltip="Désinscrire"><lucide-icon name="x" [size]="16" /></button></td>
              </tr>
            } @empty {
              <tr><td class="empty">Inscrit à aucune activité.</td></tr>
            }
          </tbody>
        </table>
      </section>
    } @else if (notFound()) {
      <div class="card empty-state"><lucide-icon name="circle-alert" [size]="36" /><h2>Adhérent introuvable</h2><p class="muted">{{ notFound() }}</p></div>
    } @else if (!code()) {
      <div class="card empty-state">
        <lucide-icon name="id-card" [size]="40" />
        <h2>Rechercher un adhérent</h2>
        <p class="muted">Tapez un ID (A003), un nom ou un prénom dans la barre de recherche, ou ouvrez une fiche depuis la <a routerLink="/adherents">liste des adhérents</a>.</p>
      </div>
    }
  `,
})
export class MemberCardPage {
  code = input<string>();
  private api = inject(ApiService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  admin = inject(AuthService).isAdmin;

  members = signal<MemberView[]>([]);
  allActivities = signal<ActivityView[]>([]);
  card = signal<MemberCard | null>(null);
  notFound = signal('');
  query = signal('');
  photoVersion = signal(Date.now());
  activityToAdd: number | null = null;

  suggestions = computed(() => {
    const q = norm(this.query());
    if (!q) return [];
    return this.members().filter((m) => norm(`${m.code} ${m.firstName} ${m.lastName} ${m.lastName} ${m.firstName}`).includes(q)).slice(0, 8);
  });
  photoUrl = computed(() => `/api/members/${this.card()?.member.id}/photo?v=${this.photoVersion()}`);
  availableActivities = computed(() => {
    const taken = this.card()?.member.activityIds ?? [];
    return this.allActivities().filter((a) => a.active && !taken.includes(a.id));
  });

  constructor() {
    this.api.members().then((m) => this.members.set(m));
    this.api.activities().then((a) => this.allActivities.set(a));
    effect(() => {
      const c = this.code();
      if (c) this.loadCard(c);
      else this.card.set(null);
    });
  }

  private async loadCard(code: string): Promise<void> {
    this.notFound.set('');
    try {
      this.card.set(await this.api.memberCard(code));
    } catch (e: any) {
      this.card.set(null);
      this.notFound.set(e?.error?.message ?? 'Adhérent introuvable.');
    }
  }

  private async reload(): Promise<void> {
    const c = this.code();
    if (c) await this.loadCard(c);
    this.api.members().then((m) => this.members.set(m));
    this.api.activities().then((a) => this.allActivities.set(a));
  }

  open(code: string): void {
    this.query.set('');
    this.router.navigate(['/fiche', code]);
  }

  async add(): Promise<void> {
    const m = await openMemberForm(this.dialog);
    if (m) {
      this.api.members().then((list) => this.members.set(list));
      this.open(m.code);
    }
  }

  async edit(m: MemberView): Promise<void> {
    if (await openMemberForm(this.dialog, m)) this.reload();
  }

  async remove(m: MemberView): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `Supprimer l'adhérent ${m.code} — ${m.firstName} ${m.lastName} ?`,
      message: 'Ses inscriptions aux activités, ses paiements annulés et sa photo seront supprimés. Cette action est irréversible.',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return;
    try {
      await this.api.remove('members', m.id);
      this.notify.success(`Adhérent ${m.code} supprimé.`);
      this.router.navigateByUrl('/fiche');
      this.api.members().then((list) => this.members.set(list));
    } catch (e) {
      this.notify.error(e);
    }
  }

  async upload(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return this.notify.error({ error: { message: 'Format non accepté : JPG ou PNG uniquement.' } });
    if (file.size > 2 * 1024 * 1024) return this.notify.error({ error: { message: 'Fichier trop volumineux (2 Mo maximum).' } });
    try {
      await this.api.upload(`/members/${this.card()!.member.id}/photo`, file);
      this.photoVersion.set(Date.now());
      this.notify.success('Photo enregistrée.');
      this.reload();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async removePhoto(): Promise<void> {
    if (!(await this.confirm.confirm({ title: 'Retirer la photo ?', confirmLabel: 'Retirer', danger: true }))) return;
    try {
      await this.api.delete(`/members/${this.card()!.member.id}/photo`);
      this.reload();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async pay(c: MemberCard): Promise<void> {
    const p = await openPaymentDialog(this.dialog, {
      memberId: c.member.id, memberLabel: `${c.member.code} — ${c.member.firstName} ${c.member.lastName}`, subscriptions: c.subscriptions,
    });
    if (p) {
      notifyReceipt(this.notify, p);
      this.reload();
    }
  }

  async editPayment(c: MemberCard, p: PaymentView): Promise<void> {
    const r = await openPaymentDialog(this.dialog, { memberId: c.member.id, memberLabel: `${c.member.code} — ${c.member.firstName} ${c.member.lastName}`, payment: p });
    if (r) {
      this.notify.success(`Paiement ${r.receiptNumber} modifié.`);
      this.reload();
    }
  }

  async cancelPayment(p: PaymentView): Promise<void> {
    const ok = await cancelWithReason(this.dialog, `Annuler le paiement ${p.receiptNumber} ?`,
      (reason) => this.api.post(`/payments/${p.id}/cancel`, { reason }));
    if (ok) {
      this.notify.success(`Paiement ${p.receiptNumber} annulé.`);
      this.reload();
    }
  }

  async deletePayment(p: PaymentView): Promise<void> {
    const subs = this.card()!.subscriptions;
    const period = subs.find((s) => s.id === p.subscriptionId);
    const removesPeriod = !!period && period.payments.length === 1 && period.id !== subs.reduce((a, b) => (b.startDate < a.startDate ? b : a)).id;
    const ok = await this.confirm.confirm({
      title: `Supprimer le paiement annulé ${p.receiptNumber} ?`,
      message: 'La ligne disparaît de l\'historique et son reçu ne pourra plus être consulté. Le numéro de reçu ne sera pas réutilisé.'
        + (removesPeriod ? ` C'est le dernier paiement du renouvellement « ${period!.packName} » : cette période sera supprimée aussi.` : ''),
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/payments/${p.id}`);
      this.notify.success(removesPeriod ? `Paiement ${p.receiptNumber} et renouvellement « ${period!.packName} » supprimés.` : `Paiement ${p.receiptNumber} supprimé.`);
      this.reload();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async renew(c: MemberCard): Promise<void> {
    const s = await openRenewDialog(this.dialog, c);
    if (s) {
      const p = s.payments.at(-1);
      if (p) notifyReceipt(this.notify, p);
      else this.notify.success(c.subscriptions.length ? 'Abonnement renouvelé.' : 'Abonnement créé.');
      this.reload();
    }
  }

  async cancelRenewal(c: MemberCard, s: SubscriptionView): Promise<void> {
    const message = c.subscriptions.length === 1 ? 'C\'est la seule période : l\'adhérent sera sans abonnement.'
      : s.current ? 'La période précédente redevient la période en cours.' : 'Les autres périodes ne changent pas.';
    const title = `Supprimer la période « ${s.packName} » du ${formatDate(s.startDate)} ?`;
    if (!(await this.confirm.confirm({ title, message, confirmLabel: 'Supprimer', danger: true }))) return;
    try {
      await this.api.remove('subscriptions', s.id);
      this.reload();
    } catch (e) {
      this.notify.error(e);
    }
  }

  openReceipt(p: PaymentView): void {
    openPdf(receiptUrl(p));
  }

  async register(): Promise<void> {
    if (!this.activityToAdd) return;
    try {
      await this.api.post('/registrations', { memberId: this.card()!.member.id, activityId: this.activityToAdd });
      this.activityToAdd = null;
      this.notify.success('Inscription enregistrée.');
      this.reload();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async unregister(a: ActivityView): Promise<void> {
    const m = this.card()!.member;
    if (!(await this.confirm.confirm({ title: `Désinscrire ${m.firstName} ${m.lastName} de « ${a.name} » ?`, confirmLabel: 'Désinscrire', danger: true }))) return;
    try {
      const regs = await this.api.registrations();
      const r = regs.find((x) => x.memberId === m.id && x.activityId === a.id);
      if (r) await this.api.remove('registrations', r.id);
      this.notify.success('Inscription supprimée.');
      this.reload();
    } catch (e) {
      this.notify.error(e);
    }
  }
}
