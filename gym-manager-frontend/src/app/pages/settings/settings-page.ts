import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { FunctionView, SettingDef, SettingsPayload, User } from '../../core/models';
import { NotifyService, apiError, errorMessage } from '../../core/notify.service';
import { ActiveBadge } from '../../shared/badges';
import { ConfirmService } from '../../shared/confirm.service';
import { openSimpleForm } from '../../shared/simple-form-dialog';
import { DataImport } from './data-import';

const VARIABLES = ['prenom', 'nom', 'jours', 'date_fin', 'club', 'pack'];
const CODE_ENTITIES: [string, string][] = [['member', 'Adhérent'], ['sport', 'Sport'], ['pack', 'Pack'], ['discount', 'Remise'], ['activity', 'Activité'], ['staff', 'Personnel']];

@Component({
  selector: 'app-settings',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule, MatSelectModule, MatSlideToggleModule,
    MatTabsModule, MatTooltipModule, LucideAngularModule, ActiveBadge, DataImport],
  template: `
    @if (payload(); as p) {
      <section class="card no-pad">
        <mat-tab-group [selectedIndex]="tab()" (selectedIndexChange)="tab.set($event)" animationDuration="0ms" mat-stretch-tabs="false">
          @for (g of groupKeys(); track g) {
            <mat-tab [label]="p.groups[g]">
              <div class="tab-body">
                @if (g === 'club') {
                  <div class="settings-form">
                    <span class="field-label">Logo</span>
                    <div class="logo-row">
                      <div class="logo-preview"><img [src]="config.logoUrl()" alt="Logo du club" /></div>
                      <label mat-stroked-button class="photo-btn"><lucide-icon name="upload" [size]="16" /> Téléverser un autre logo…
                        <input type="file" accept="image/png,image/jpeg" class="sr-only" (change)="uploadLogo($event)" /></label>
                      @if (config.customLogoUrl()) {<button mat-button class="btn-text-danger" (click)="removeLogo()">Rétablir le logo par défaut</button>}
                      <small class="muted">JPG ou PNG (de préférence sur fond transparent), 2 Mo max. Utilisé dans le menu et sur les reçus.</small>
                    </div>
                  </div>
                }
                @if (g === 'codes') {
                  <table class="table compact max-640">
                    <thead><tr><th>Entité</th><th>Préfixe</th><th>Chiffres</th><th>Prochain code</th></tr></thead>
                    <tbody>
                      @for (e of codeEntities; track e[0]) {
                        <tr>
                          <td>{{ e[1] }}</td>
                          <td><input class="cell-input w-80" [(ngModel)]="values['codes.' + e[0] + '.prefix']" [attr.aria-label]="'Préfixe ' + e[1]" /></td>
                          <td><input class="cell-input w-60" type="number" min="1" max="8" [(ngModel)]="values['codes.' + e[0] + '.digits']" [attr.aria-label]="'Chiffres ' + e[1]" /></td>
                          <td class="code">{{ preview(e[0]) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                  <p class="muted small">Les codes déjà attribués ne changent pas ; un code n'est jamais réutilisé.</p>
                } @else {
                  <div class="settings-form">
                    @for (d of defs(g); track d.key) {
                      <label class="field-label" [attr.for]="d.key">{{ d.label }}</label>
                      <div class="field-cell">
                        @switch (d.type) {
                          @case ('bool') {
                            <mat-slide-toggle [id]="d.key" [ngModel]="values[d.key] === 'true'" (ngModelChange)="values[d.key] = $event ? 'true' : 'false'">{{ values[d.key] === 'true' ? 'Oui' : 'Non' }}</mat-slide-toggle>
                          }
                          @case ('enum') {
                            @if (d.key === 'salary.multiCoach') {
                              <mat-radio-group [id]="d.key" [(ngModel)]="values[d.key]" [attr.aria-label]="d.label">
                                @for (o of d.options; track o.value) {<mat-radio-button [value]="o.value">{{ o.label }}</mat-radio-button>}
                              </mat-radio-group>
                            } @else {
                              <mat-form-field subscriptSizing="dynamic" class="w-220">
                                <mat-select [id]="d.key" [(ngModel)]="values[d.key]" [aria-label]="d.label">
                                  @for (o of d.options; track o.value) {<mat-option [value]="o.value">{{ o.label }}</mat-option>}
                                </mat-select>
                              </mat-form-field>
                            }
                          }
                          @case ('template') {
                            <textarea [id]="d.key" class="textarea" rows="3" [(ngModel)]="values[d.key]" (focus)="focusedTemplate = d.key"></textarea>
                            <div class="chips-row">
                              <span class="muted small">Variables :</span>
                              @for (v of variables; track v) {<button type="button" class="chip chip-btn" (click)="insert(d.key, v)">{{ '{' + v + '}' }}</button>}
                            </div>
                            <div class="preview-box"><span class="muted small">Aperçu</span> {{ render(values[d.key]) }}</div>
                          }
                          @case ('int') {
                            <mat-form-field subscriptSizing="dynamic" class="w-140">
                              <input matInput [id]="d.key" type="number" [min]="d.min" [max]="d.max" [(ngModel)]="values[d.key]" />
                              @if (d.key.startsWith('alerts.')) {<span matTextSuffix>&nbsp;jours</span>}
                            </mat-form-field>
                          }
                          @case ('secret') {
                            <mat-form-field subscriptSizing="dynamic" class="w-full max-480">
                              <input matInput [id]="d.key" type="password" autocomplete="new-password" [(ngModel)]="values[d.key]"
                                [placeholder]="p.secretsSet[d.key] ? 'Clé enregistrée — laisser vide pour la conserver' : 'Aucune clé enregistrée'" />
                              <mat-hint>{{ p.secretsSet[d.key] ? 'Une clé est enregistrée ; elle n’est jamais réaffichée. Saisir une nouvelle clé pour la remplacer.' : 'Laisser vide pour utiliser la variable BREVO_API_KEY du serveur.' }}</mat-hint>
                            </mat-form-field>
                          }
                          @default {
                            <mat-form-field subscriptSizing="dynamic" class="w-full max-480">
                              <input matInput [id]="d.key" [type]="d.type === 'email' ? 'email' : 'text'" [(ngModel)]="values[d.key]" />
                              @if (d.key === 'mail.from') {<mat-hint>Adresse vérifiée dans Brevo. Laisser vide pour utiliser la variable MAIL_FROM du serveur.</mat-hint>}
                              @if (d.type === 'share') {<mat-hint>Fraction (1/3) ou pourcentage (33,33 ou 40 %)</mat-hint>}
                              @if (d.type === 'regex') {<mat-hint>Ex. : ^0[5-7]\\d{{ '{' }}8{{ '}' }}$ pour 06XXXXXXXX</mat-hint>}
                            </mat-form-field>
                          }
                        }
                        @if (fieldError()?.field === d.key) {<p class="form-error">{{ fieldError()?.message }}</p>}
                      </div>
                    }
                  </div>
                }
                @if (g === 'mail') {
                  <p class="muted small">L’envoi des e-mails passe par l’API HTTP de Brevo : le serveur, le port et la connexion SMTP sont enregistrés mais pas utilisés pour l’envoi.</p>
                }
                <div class="row-end tab-actions">
                  <button mat-stroked-button (click)="reset(g)"><lucide-icon name="rotate-ccw" [size]="16" /> Rétablir les valeurs par défaut</button>
                  <button mat-flat-button (click)="save(g)" [disabled]="busy()">Enregistrer</button>
                </div>
              </div>
            </mat-tab>
          }

          <mat-tab label="Fonctions">
            <div class="tab-body">
              <table class="table compact max-640">
                <thead><tr><th>Fonction</th><th>Actif</th><th><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  @for (f of functions(); track f.id) {
                    <tr [class.inactive]="!f.active">
                      <td class="strong">{{ f.label }}</td><td><app-active-badge [active]="f.active" /></td>
                      <td class="actions">
                        <button class="icon-btn" (click)="editFunction(f)" matTooltip="Modifier" [attr.aria-label]="'Modifier ' + f.label"><lucide-icon name="pencil" [size]="16" /></button>
                        <button class="icon-btn" (click)="toggleFunction(f)" [matTooltip]="f.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(f.active ? 'Désactiver ' : 'Réactiver ') + f.label"><lucide-icon name="power" [size]="16" /></button>
                        <button class="icon-btn danger" (click)="removeFunction(f)" matTooltip="Supprimer" [attr.aria-label]="'Supprimer ' + f.label"><lucide-icon name="trash-2" [size]="16" /></button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              <button mat-flat-button class="mt" (click)="editFunction()"><lucide-icon name="plus" [size]="16" /> Ajouter une fonction</button>
            </div>
          </mat-tab>

          <mat-tab label="Données">
            <div class="tab-body"><app-data-import /></div>
          </mat-tab>

          <mat-tab label="Utilisateurs">
            <div class="tab-body">
              <table class="table compact max-760">
                <thead><tr><th>Identifiant</th><th>E-mail</th><th>Rôle</th><th>Actif</th><th>Mot de passe</th><th><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  @for (u of users(); track u.id) {
                    <tr [class.inactive]="!u.active">
                      <td class="strong">{{ u.username }} @if (u.username === me()) {<span class="muted">(vous)</span>}</td>
                      <td>@if (u.email) {<span>{{ u.email }}</span>} @else {<span class="muted">—</span>}</td>
                      <td>
                        <select class="cell-input" [ngModel]="u.role" (ngModelChange)="setRole(u, $event)" [disabled]="u.username === me()" [attr.aria-label]="'Rôle de ' + u.username">
                          <option value="ADMIN">ADMIN</option><option value="ACCUEIL">ACCUEIL</option>
                        </select>
                      </td>
                      <td><app-active-badge [active]="u.active" /></td>
                      <td>@if (u.mustChangePassword) {<span class="badge warn">à changer</span>} @else {<span class="muted">—</span>}</td>
                      <td class="actions">
                        <button class="icon-btn" (click)="editEmail(u)" matTooltip="Modifier l'e-mail" [attr.aria-label]="'Modifier l’e-mail de ' + u.username"><lucide-icon name="mail" [size]="16" /></button>
                        <button mat-stroked-button class="sm" (click)="resetPassword(u)"><lucide-icon name="key-round" [size]="14" /> Réinitialiser</button>
                        @if (u.username !== me()) {
                          <button class="icon-btn" (click)="toggleUser(u)" [matTooltip]="u.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(u.active ? 'Désactiver ' : 'Réactiver ') + u.username"><lucide-icon name="power" [size]="16" /></button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              <button mat-flat-button class="mt" (click)="addUser()"><lucide-icon name="user-plus" [size]="16" /> Nouvel utilisateur</button>
            </div>
          </mat-tab>
        </mat-tab-group>
      </section>
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
})
export class SettingsPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  config = inject(ConfigService);
  private auth = inject(AuthService);

  payload = signal<SettingsPayload | null>(null);
  functions = signal<FunctionView[]>([]);
  users = signal<User[]>([]);
  tab = signal(0);
  busy = signal(false);
  fieldError = signal<{ field?: string; message: string } | null>(null);
  values: Record<string, string> = {};
  focusedTemplate = '';
  variables = VARIABLES;
  codeEntities = CODE_ENTITIES;
  me = computed(() => this.auth.user()?.username);
  groupKeys = computed(() => Object.keys(this.payload()?.groups ?? {}));

  constructor() {
    this.load();
    this.loadFunctions();
    this.loadUsers();
  }

  private apply(p: SettingsPayload): void {
    this.payload.set(p);
    this.values = { ...p.values };
  }

  async load(): Promise<void> {
    try {
      this.apply(await this.api.settings());
    } catch (e) {
      this.notify.error(e);
    }
  }

  defs(group: string): SettingDef[] {
    return (this.payload()?.definitions ?? []).filter((d) => d.group === group);
  }

  /** Next code with the prefix/digits currently typed (counter from the server). */
  preview(entity: string): string {
    const next = this.payload()?.nextCodes[entity] ?? '';
    const n = Number(next.replace(/\D/g, '')) || 1;
    const digits = Math.max(1, Math.min(8, Number(this.values[`codes.${entity}.digits`]) || 1));
    return `${(this.values[`codes.${entity}.prefix`] ?? '').toUpperCase()}${String(n).padStart(digits, '0')}`;
  }

  render(template: string): string {
    const sample: Record<string, string> = { prenom: 'Hamza', nom: 'Amrani', jours: '246', date_fin: '17/03/2026', club: this.config.clubName(), pack: 'Aérobic - Mensuel' };
    return (template ?? '').replace(/\{(\w+)\}/g, (all, k: string) => sample[k] ?? all);
  }

  insert(key: string, variable: string): void {
    this.values[key] = `${this.values[key] ?? ''}{${variable}}`;
  }

  async save(group: string): Promise<void> {
    const keys = (this.payload()?.definitions ?? []).filter((d) => d.group === group).map((d) => d.key);
    const values = Object.fromEntries(keys.map((k) => [k, String(this.values[k] ?? '')]));
    this.busy.set(true);
    this.fieldError.set(null);
    try {
      this.apply(await this.api.put<SettingsPayload>('/settings', { values }));
      await this.config.load();
      this.notify.success('Paramètres enregistrés.');
    } catch (e) {
      const err = apiError(e);
      this.fieldError.set(err ? { field: err.field, message: err.message } : null);
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async reset(group: string): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `Rétablir les valeurs par défaut de l'onglet « ${this.payload()?.groups[group]} » ?`,
      message: group === 'club' ? 'Le nom, l’adresse, le téléphone et le logo du club reviennent aux valeurs d’origine.'
        : group === 'mail' ? 'L’expéditeur est vidé, la clé API Brevo enregistrée est supprimée et les paramètres SMTP reviennent aux valeurs d’origine.'
        : 'Les valeurs de cet onglet reviennent à celles du cahier des charges.',
      confirmLabel: 'Rétablir', danger: true,
    });
    if (!ok) return;
    try {
      this.apply(await this.api.post<SettingsPayload>(`/settings/reset/${group}`));
      await this.config.load();
      this.notify.success('Valeurs par défaut rétablies.');
    } catch (e) {
      this.notify.error(e);
    }
  }

  async uploadLogo(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      await this.api.upload('/club/logo', file);
      await this.config.load();
      this.notify.success('Logo mis à jour.');
    } catch (e) {
      this.notify.error(e);
    }
  }

  async removeLogo(): Promise<void> {
    if (!(await this.confirm.confirm({ title: 'Revenir au logo par défaut du club ?', confirmLabel: 'Rétablir', danger: true }))) return;
    try {
      await this.api.delete('/club/logo');
      await this.config.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  // ---------------------------------------------------------------- functions

  async loadFunctions(): Promise<void> {
    this.functions.set(await this.api.functions());
  }

  async editFunction(f?: FunctionView): Promise<void> {
    const ok = await openSimpleForm(this.dialog, {
      title: f ? `Modifier la fonction « ${f.label} »` : 'Nouvelle fonction',
      fields: [{ key: 'label', label: 'Libellé', required: true }],
      value: { label: f?.label ?? '' },
      submit: (v) => this.api.save('functions', f?.id, v),
    });
    if (ok) this.loadFunctions();
  }

  async toggleFunction(f: FunctionView): Promise<void> {
    if (!(await this.confirm.confirm({ title: `${f.active ? 'Désactiver' : 'Réactiver'} la fonction « ${f.label} » ?`, confirmLabel: f.active ? 'Désactiver' : 'Réactiver', danger: f.active }))) return;
    try {
      await this.api.setActive('functions', f.id, !f.active);
      this.loadFunctions();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async removeFunction(f: FunctionView): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer la fonction « ${f.label} » ?`, message: 'Une fonction utilisée ne peut pas être supprimée : désactivez-la.', confirmLabel: 'Supprimer', danger: true }))) return;
    try {
      await this.api.remove('functions', f.id);
      this.loadFunctions();
    } catch (e) {
      this.notify.error(e);
    }
  }

  // ---------------------------------------------------------------- users

  async loadUsers(): Promise<void> {
    this.users.set(await this.api.users());
  }

  async addUser(): Promise<void> {
    const ok = await openSimpleForm(this.dialog, {
      title: 'Nouvel utilisateur',
      fields: [
        { key: 'username', label: 'Identifiant', required: true },
        { key: 'password', label: 'Mot de passe provisoire', type: 'password', required: true, hint: 'À changer à la première connexion (8 caractères, lettres et chiffres).' },
        { key: 'role', label: 'Rôle', type: 'select', required: true, options: [{ value: 'ACCUEIL', label: 'ACCUEIL' }, { value: 'ADMIN', label: 'ADMIN' }] },
        { key: 'email', label: 'Adresse e-mail', type: 'email', hint: 'Facultative : permet de recevoir un mot de passe provisoire en cas d\'oubli.' },
      ],
      value: { username: '', password: '', role: 'ACCUEIL', email: '' },
      submit: (v) => this.api.post('/users', v),
    });
    if (ok) {
      this.notify.success('Utilisateur créé.');
      this.loadUsers();
    }
  }

  async editEmail(u: User): Promise<void> {
    const ok = await openSimpleForm(this.dialog, {
      title: `Adresse e-mail de ${u.username}`,
      fields: [{ key: 'email', label: 'Adresse e-mail', type: 'email', hint: 'Laisser vide pour la retirer.' }],
      value: { email: u.email ?? '' },
      submit: (v) => this.api.put(`/users/${u.id}`, { email: v['email'] ?? '' }),
    });
    if (ok) {
      this.notify.success('Adresse e-mail enregistrée.');
      this.loadUsers();
    }
  }

  async setRole(u: User, role: string): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Passer ${u.username} en ${role} ?`, confirmLabel: 'Confirmer' }))) {
      this.loadUsers();
      return;
    }
    try {
      await this.api.put(`/users/${u.id}`, { role });
      this.loadUsers();
    } catch (e) {
      this.notify.error(e);
      this.loadUsers();
    }
  }

  async toggleUser(u: User): Promise<void> {
    if (!(await this.confirm.confirm({ title: `${u.active ? 'Désactiver' : 'Réactiver'} le compte ${u.username} ?`, confirmLabel: u.active ? 'Désactiver' : 'Réactiver', danger: u.active }))) return;
    try {
      await this.api.put(`/users/${u.id}`, { active: !u.active });
      this.loadUsers();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async resetPassword(u: User): Promise<void> {
    const ok = await openSimpleForm(this.dialog, {
      title: `Réinitialiser le mot de passe de ${u.username}`,
      fields: [{ key: 'password', label: 'Mot de passe provisoire', type: 'password', required: true, hint: "L'utilisateur devra le changer à sa prochaine connexion." }],
      value: { password: '' },
      submit: (v) => this.api.post(`/users/${u.id}/reset-password`, v),
    });
    if (ok) {
      this.notify.success('Mot de passe réinitialisé.');
      this.loadUsers();
    }
  }
}
