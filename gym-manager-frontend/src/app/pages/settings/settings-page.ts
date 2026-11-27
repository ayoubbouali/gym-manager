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
import { FunctionView, PurgePreview, PurgeReason, SettingDef, SettingsPayload, User, UserRoleView } from '../../core/models';
import { FrDatePipe } from '../../core/format';
import { NotifyService, apiError, errorMessage } from '../../core/notify.service';
import { ActiveBadge } from '../../shared/badges';
import { ConfirmService } from '../../shared/confirm.service';
import { PhoneInput, PhoneValue } from '../../shared/phone-input';
import { openSimpleForm } from '../../shared/simple-form-dialog';
import { DataImport } from './data-import';
import { ListPicker, PickOption } from './list-picker';
import { applyRegional } from './regional';
import { PAGE_RIGHTS, RoleFormDialog, permissionSummary } from './role-form-dialog';
import { WRITE_RIGHTS } from '../../layout/nav';
import { UserFormDialog } from './user-form-dialog';
import { firstValueFrom } from 'rxjs';

const VARIABLES = ['prenom', 'nom', 'jours', 'date_fin', 'club', 'pack'];
const RESET_TEMPLATE = 'mail.reset.template';
const RESET_VARIABLES = ['identifiant', 'mot_de_passe', 'duree', 'club'];
const CODE_ENTITIES: [string, string][] = [['member', 'Adhérent'], ['sport', 'Sport'], ['pack', 'Pack'], ['discount', 'Remise'], ['activity', 'Activité'], ['staff', 'Personnel']];
import { Pager, Paged } from '../../shared/table';

@Component({
  selector: 'app-settings',
  imports: [Pager, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule, MatSelectModule, MatSlideToggleModule,
    MatTabsModule, MatTooltipModule, LucideAngularModule, ActiveBadge, FrDatePipe, DataImport, ListPicker, PhoneInput],
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
                            <textarea [id]="d.key" class="textarea" [rows]="d.key === resetTemplate ? 12 : 3" [(ngModel)]="values[d.key]" (focus)="focusedTemplate = d.key"></textarea>
                            <div class="chips-row">
                              <span class="muted small">Variables :</span>
                              @for (v of variablesFor(d.key); track v) {<button type="button" class="chip chip-btn" (click)="insert(d.key, v)">{{ '{' + v + '}' }}</button>}
                            </div>
                            <div class="preview-box" [class.pre-line]="d.key === resetTemplate"><span class="muted small">Aperçu</span> {{ render(values[d.key]) }}</div>
                          }
                          @case ('int') {
                            <mat-form-field subscriptSizing="dynamic" class="w-140">
                              <input matInput [id]="d.key" type="number" [min]="d.min" [max]="d.max" [(ngModel)]="values[d.key]" />
                              @if (d.key.startsWith('alerts.')) {<span matTextSuffix>&nbsp;jours</span>}
                              @if (d.key === 'purge.months') {<span matTextSuffix>&nbsp;mois</span>}
                            </mat-form-field>
                          }
                          @case ('secret') {
                            <mat-form-field subscriptSizing="dynamic" class="w-full max-480">
                              <input matInput [id]="d.key" type="password" autocomplete="new-password" [(ngModel)]="values[d.key]"
                                [placeholder]="p.secretsSet[d.key] ? 'Clé enregistrée — laisser vide pour la conserver' : 'Aucune clé enregistrée'" />
                              <mat-hint>{{ p.secretsSet[d.key] ? 'Une clé est enregistrée ; elle n’est jamais réaffichée. Saisir une nouvelle clé pour la remplacer.' : 'Laisser vide pour utiliser la variable BREVO_API_KEY du serveur.' }}</mat-hint>
                            </mat-form-field>
                          }
                          @case ('country') {
                            <app-list-picker [inputId]="d.key" [ariaLabel]="d.label" [options]="countryOptions()" [value]="values[d.key]"
                              (valueChange)="setRegional(d.key, $event)" hint="Choisir un pays renseigne sa devise. Les téléphones s’ouvrent sur ce pays." />
                          }
                          @case ('city') {
                            <app-list-picker [inputId]="d.key" [ariaLabel]="d.label" [options]="cityOptions()" [value]="values[d.key]"
                              (valueChange)="setRegional(d.key, $event)" hint="Facultative : à préciser si l’heure du club diffère de celle de la capitale." />
                          }
                          @case ('currency') {
                            <app-list-picker [inputId]="d.key" [ariaLabel]="d.label" [options]="currencyOptions()" [value]="values[d.key]"
                              (valueChange)="setRegional(d.key, $event)" hint="Choisir une devise renseigne le symbole affiché." />
                          }
                          @case ('readonly') {
                            <mat-form-field subscriptSizing="dynamic" class="w-140">
                              <input matInput [id]="d.key" [value]="values[d.key]" disabled />
                              <mat-hint>Symbole de la devise choisie.</mat-hint>
                            </mat-form-field>
                          }
                          @case ('phone') {
                            <app-phone-input class="max-480" [inputId]="d.key" subscriptSizing="dynamic" [ngModel]="clubPhone" (ngModelChange)="clubPhone = $event" />
                          }
                          @default {
                            <mat-form-field subscriptSizing="dynamic" class="w-full max-480">
                              <input matInput [id]="d.key" [type]="d.type === 'email' ? 'email' : 'text'" [(ngModel)]="values[d.key]" />
                              @if (d.key === 'mail.reset.subject') {<mat-hint>Variables possibles : {{ '{' }}identifiant{{ '}' }}, {{ '{' }}duree{{ '}' }}, {{ '{' }}club{{ '}' }} — jamais le mot de passe.</mat-hint>}
                              @if (d.key === 'mail.from') {<mat-hint>Adresse vérifiée dans Brevo. Laisser vide pour utiliser la variable MAIL_FROM du serveur.</mat-hint>}
                              @if (d.type === 'share') {<mat-hint>Fraction (1/3) ou pourcentage (33,33 ou 40 %)</mat-hint>}
                            </mat-form-field>
                          }
                        }
                        @if (fieldError()?.field === d.key) {<p class="form-error">{{ fieldError()?.message }}</p>}
                      </div>
                    }
                  </div>
                }
                @if (g === 'purge') {
                  <p class="muted small">Seuls les adhérents <strong>sans aucun reste à payer</strong> sont supprimés : un reste à payer les garde, quelle que soit leur ancienneté.
                    La suppression est définitive et emporte la fiche, la photo, les abonnements et <strong>tous les paiements</strong> (le chiffre d’affaires passé baisse d’autant).
                    Réactiver un adhérent ou lui créer un abonnement arrête son délai.</p>
                  @if (purgePreview(); as pp) {
                    <h3 class="section-title">Prochaine exécution (cette nuit), selon les paramètres enregistrés</h3>
                    @if (!pp.enabled) {
                      <p class="muted small">La suppression automatique est désactivée : rien ne sera supprimé. Avec ces réglages, elle concernerait {{ pp.members.length }} adhérent(s).</p>
                    } @else if (pp.members.length === 0) {
                      <p class="muted small">Aucun adhérent ne remplit aujourd’hui les conditions.</p>
                    }
                    @if (pp.members.length) {
                      <table class="table compact max-640">
                        <thead><tr><th>Code</th><th>Adhérent</th><th>Motif</th><th>Depuis le</th></tr></thead>
                        <tbody>
                          @for (m of purgeRows.page(); track m.id) {
                            <tr><td class="code">{{ m.code }}</td><td>{{ m.name }}</td><td>{{ purgeReasons[m.reason] }}</td><td>{{ m.since | frDate }}</td></tr>
                          }
                        </tbody>
                      </table>
                      <app-pager class="max-640" [table]="purgeRows" [auto]="true" />
                    }
                  }
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
                  @for (f of functionRows.page(); track f.id) {
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
              <app-pager class="max-640" [table]="functionRows" [auto]="true" />
              <button mat-flat-button class="mt" (click)="editFunction()"><lucide-icon name="plus" [size]="16" /> Ajouter une fonction</button>
            </div>
          </mat-tab>

          <mat-tab label="Données">
            <div class="tab-body"><app-data-import /></div>
          </mat-tab>

          <mat-tab label="Utilisateurs">
            <div class="tab-body">
              <table class="table compact">
                <thead><tr><th>Identifiant</th><th>E-mail</th><th>Téléphone</th><th>Rôle</th><th>Actif</th><th>Mot de passe</th><th><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  @for (u of userRows.page(); track u.id) {
                    <tr [class.inactive]="!u.active">
                      <td class="strong">
                        <span class="user-cell">
                          @if (u.hasPhoto) {<img class="avatar" [src]="'/api/users/' + u.id + '/photo'" alt="" />} @else {<span class="avatar">{{ u.username.slice(0, 1).toUpperCase() }}</span>}
                          {{ u.username }} @if (u.username === me()) {<span class="muted">(vous)</span>}
                        </span>
                      </td>
                      <td>@if (u.email) {<span>{{ u.email }}</span>} @else {<span class="muted">—</span>}</td>
                      <td>@if (u.phone) {<span>{{ u.phone }}</span>} @else {<span class="muted">—</span>}</td>
                      <td>
                        <select class="cell-input" [ngModel]="u.roleId" (ngModelChange)="setRole(u, $event)" [disabled]="u.username === me()" [attr.aria-label]="'Rôle de ' + u.username">
                          @for (r of roles(); track r.id) {<option [ngValue]="r.id">{{ r.name }}</option>}
                        </select>
                      </td>
                      <td><app-active-badge [active]="u.active" /></td>
                      <td>@if (u.mustChangePassword) {<span class="badge warn">à changer</span>} @else {<span class="muted">—</span>}</td>
                      <td class="actions">
                        <button class="icon-btn" (click)="editUser(u)" matTooltip="Modifier l'e-mail et le téléphone" [attr.aria-label]="'Modifier ' + u.username"><lucide-icon name="pencil" [size]="16" /></button>
                        <button mat-stroked-button class="sm" (click)="resetPassword(u)"><lucide-icon name="key-round" [size]="14" /> Réinitialiser</button>
                        @if (u.username !== me()) {
                          <button class="icon-btn" (click)="toggleUser(u)" [matTooltip]="u.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(u.active ? 'Désactiver ' : 'Réactiver ') + u.username"><lucide-icon name="power" [size]="16" /></button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              <app-pager [table]="userRows" [auto]="true" />
              <button mat-flat-button class="mt" (click)="addUser()"><lucide-icon name="user-plus" [size]="16" /> Nouvel utilisateur</button>

              <h3 class="mt-lg">Rôles</h3>
              <p class="muted small">Chaque rôle porte un nom libre et la liste des pages du menu qu'il ouvre, plus deux droits de modification
                (référentiels, corrections de paiements). Le serveur refuse tout ce qui n'est pas coché.</p>
              <table class="table compact max-640">
                <thead><tr><th>Rôle</th><th>Pages et droits</th><th>Utilisateurs</th><th><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  @for (r of roleRows.page(); track r.id) {
                    <tr>
                      <td class="strong">{{ r.name }}</td>
                      <td><span [matTooltip]="permissionList(r)">{{ summary(r.permissions) }}</span></td>
                      <td>{{ r.userCount }}</td>
                      <td class="actions">
                        <button class="icon-btn" (click)="editRole(r)" matTooltip="Modifier" [attr.aria-label]="'Modifier le rôle ' + r.name"><lucide-icon name="pencil" [size]="16" /></button>
                        <button class="icon-btn danger" (click)="removeRole(r)" matTooltip="Supprimer" [attr.aria-label]="'Supprimer le rôle ' + r.name"><lucide-icon name="trash-2" [size]="16" /></button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              <app-pager class="max-640" [table]="roleRows" [auto]="true" />
              <button mat-flat-button class="mt" (click)="editRole()"><lucide-icon name="plus" [size]="16" /> Nouveau rôle</button>
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
  roles = signal<UserRoleView[]>([]);
  summary = permissionSummary;
  tab = signal(0);
  purgePreview = signal<PurgePreview | null>(null);
  purgeRows = new Paged(() => this.purgePreview()?.members ?? []);
  functionRows = new Paged(() => this.functions());
  userRows = new Paged(() => this.users());
  roleRows = new Paged(() => this.roles());
  readonly purgeReasons: Record<PurgeReason, string> = { INACTIVE: 'Désactivé', EXPIRED: 'Expiré', NO_SUBSCRIPTION: 'Sans abonnement' };
  busy = signal(false);
  fieldError = signal<{ field?: string; message: string } | null>(null);
  values: Record<string, string> = {};
  focusedTemplate = '';
  resetTemplate = RESET_TEMPLATE;
  codeEntities = CODE_ENTITIES;
  me = computed(() => this.auth.user()?.username);
  groupKeys = computed(() => Object.keys(this.payload()?.groups ?? {}));
  currencyOptions = computed<PickOption[]>(() =>
    (this.payload()?.regional.currencies ?? []).map((c) => ({ value: c.code, label: `${c.code} — ${c.label} (${c.symbol})` })));
  countryOptions = computed<PickOption[]>(() => (this.payload()?.regional.countries ?? []).map((c) => ({ value: c.code, label: c.label })));
  /** Cities of the country currently chosen (not saved yet), most populous first. */
  cities = signal<string[]>([]);
  cityOptions = computed<PickOption[]>(() => [{ value: '', label: 'Non précisée' }, ...this.cities().map((c) => ({ value: c, label: c }))]);
  private citiesOf = '';
  /** Club phone with the country chosen in its field; `values['club.phone']` is only the stored number. */
  clubPhone: PhoneValue = { country: null, number: '' };

  constructor() {
    this.load();
    this.loadFunctions();
    this.loadUsers();
  }

  private apply(p: SettingsPayload): void {
    this.payload.set(p);
    this.loadPurgePreview();
    this.values = { ...p.values };
    this.clubPhone = { country: null, number: p.values['club.phone'] ?? '' };
    this.loadCities(this.values['regional.country']);
  }

  private async loadCities(country: string | undefined): Promise<void> {
    if (!country || country === this.citiesOf) return;
    this.citiesOf = country;
    this.cities.set([]);
    try {
      const list = await this.api.get<string[]>('/admin/regional/cities', { country });
      // a later choice wins over a slower answer
      if (this.citiesOf === country) this.cities.set(list);
    } catch (e) {
      if (this.citiesOf === country) this.citiesOf = '';
      this.notify.error(e);
    }
  }

  async load(): Promise<void> {
    try {
      this.apply(await this.api.settings());
    } catch (e) {
      this.notify.error(e);
    }
  }

  /** Reloaded with the settings, so it always reflects the saved values. */
  private async loadPurgePreview(): Promise<void> {
    try {
      this.purgePreview.set(await this.api.get<PurgePreview>('/settings/purge-preview'));
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

  setRegional(key: string, value: string): void {
    applyRegional(this.values, key, value, this.payload()?.regional, this.payload()?.values);
    if (key === 'regional.country') this.loadCities(value);
  }

  render(template: string): string {
    const sample: Record<string, string> = { prenom: 'Hamza', nom: 'Amrani', jours: '246', date_fin: '17/03/2026', club: this.config.clubName(), pack: 'Aérobic - Mensuel',
      identifiant: 'accueil', mot_de_passe: 'Xk7mP2qR9tWb', duree: '30' };
    return (template ?? '').replace(/\{(\w+)\}/g, (all, k: string) => sample[k] ?? all);
  }

  variablesFor(key: string): string[] {
    return key === RESET_TEMPLATE ? RESET_VARIABLES : VARIABLES;
  }

  insert(key: string, variable: string): void {
    this.values[key] = `${this.values[key] ?? ''}{${variable}}`;
  }

  async save(group: string): Promise<void> {
    const keys = (this.payload()?.definitions ?? []).filter((d) => d.group === group).map((d) => d.key);
    const values = Object.fromEntries(keys.map((k) => [k, String(this.values[k] ?? '')]));
    const phoneCountries: Record<string, string> = {};
    if (keys.includes('club.phone')) {
      values['club.phone'] = this.clubPhone.number;
      if (this.clubPhone.country) phoneCountries['club.phone'] = this.clubPhone.country;
    }
    this.busy.set(true);
    this.fieldError.set(null);
    try {
      this.apply(await this.api.put<SettingsPayload>('/settings', { values, phoneCountries }));
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
        : group === 'mail' ? 'L’expéditeur est vidé, la clé API Brevo enregistrée est supprimée, et les paramètres SMTP et le modèle de l’e-mail « mot de passe oublié » reviennent aux valeurs d’origine.'
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
    const [users, roles] = await Promise.all([this.api.users(), this.api.roles()]);
    this.users.set(users);
    this.roles.set(roles);
    // keeps "Mon compte" and the top bar in step with an edit of one's own account made here
    const self = users.find((u) => u.id === this.auth.user()?.id);
    if (self) this.auth.user.set(self);
  }

  // ---------------------------------------------------------------- roles

  permissionList = permissionList;

  async editRole(r?: UserRoleView): Promise<void> {
    const ok = await firstValueFrom(this.dialog.open(RoleFormDialog, { data: { role: r }, width: '460px', maxWidth: '96vw' }).afterClosed());
    if (ok) {
      this.notify.success(r ? 'Rôle enregistré.' : 'Rôle créé.');
      this.loadUsers();
    }
  }

  async removeRole(r: UserRoleView): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer le rôle « ${r.name} » ?`, message: 'Un rôle attribué à des utilisateurs ne peut pas être supprimé.', confirmLabel: 'Supprimer', danger: true }))) return;
    try {
      await this.api.remove('roles', r.id);
      this.loadUsers();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async addUser(): Promise<void> {
    if (await this.openUserForm()) {
      this.notify.success('Utilisateur créé.');
      this.loadUsers();
    }
  }

  async editUser(u: User): Promise<void> {
    if (await this.openUserForm(u)) {
      this.notify.success('Utilisateur enregistré.');
      this.loadUsers();
    }
  }

  private openUserForm(user?: User): Promise<unknown> {
    return firstValueFrom(this.dialog.open(UserFormDialog, { data: { user, roles: this.roles() }, width: '460px', maxWidth: '96vw' }).afterClosed());
  }

  async setRole(u: User, roleId: number): Promise<void> {
    const role = this.roles().find((r) => r.id === roleId);
    if (!role || !(await this.confirm.confirm({ title: `Passer ${u.username} en ${role.name} ?`, message: permissionList(role), confirmLabel: 'Confirmer' }))) {
      this.loadUsers();
      return;
    }
    try {
      await this.api.put(`/users/${u.id}`, { roleId });
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

/** Labels of what a role grants, in menu order. */
function permissionList(r: UserRoleView): string {
  const labels = [...PAGE_RIGHTS, ...WRITE_RIGHTS].filter((x) => r.permissions.includes(x.permission)).map((x) => x.label);
  return ['Accueil', ...labels].join(', ');
}
