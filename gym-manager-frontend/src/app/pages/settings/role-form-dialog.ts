import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatPseudoCheckboxModule } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { Permission, UserRoleView } from '../../core/models';
import { errorMessage } from '../../core/notify.service';
import { NAV, WRITE_RIGHTS } from '../../layout/nav';

/** Menu pages a role may be granted, in menu order (Accueil is open to everyone). */
export const PAGE_RIGHTS = NAV.flatMap((g) => g.items)
  .filter((i) => !!i.permission)
  .map((i) => ({ permission: i.permission!, label: i.label }));

/** "8 pages · 1 droit" style summary of a role's permissions. */
export function permissionSummary(permissions: readonly Permission[]): string {
  const pages = PAGE_RIGHTS.filter((p) => permissions.includes(p.permission)).length;
  const rights = WRITE_RIGHTS.filter((r) => permissions.includes(r.permission)).length;
  const parts = [pages === PAGE_RIGHTS.length ? 'Toutes les pages' : `${pages} page${pages > 1 ? 's' : ''}`];
  if (rights) parts.push(`${rights} droit${rights > 1 ? 's' : ''} de modification`);
  return parts.join(' · ');
}

/** Creates or edits a role: its name and the menu pages and write rights it grants. */
@Component({
  selector: 'app-role-form',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatMenuModule, MatPseudoCheckboxModule,
    MatDividerModule, LucideAngularModule],
  template: `
    <h2 mat-dialog-title>{{ d.role ? 'Modifier le rôle « ' + d.role.name + ' »' : 'Nouveau rôle' }}</h2>
    <mat-dialog-content>
      <form id="role-form" class="stack" (ngSubmit)="save()">
        <mat-form-field class="w-full">
          <mat-label>Nom du rôle</mat-label>
          <input matInput name="name" [(ngModel)]="name" required />
          <mat-hint>Exemples : Coach, Comptable, Gérant.</mat-hint>
        </mat-form-field>
        <div>
          <button mat-stroked-button type="button" class="w-full" [matMenuTriggerFor]="rightsMenu">
            <lucide-icon name="shield-check" [size]="16" /> Pages et droits : {{ summary() }}
          </button>
          <mat-menu #rightsMenu="matMenu" class="columns-menu">
            <button mat-menu-item role="menuitemcheckbox" aria-checked="true" disabled>
              <mat-pseudo-checkbox state="checked" [disabled]="true" />Accueil
            </button>
            @for (p of pages; track p.permission) {
              <button mat-menu-item type="button" role="menuitemcheckbox" [attr.aria-checked]="has(p.permission)"
                      (click)="$event.stopPropagation(); toggle(p.permission)">
                <mat-pseudo-checkbox [state]="has(p.permission) ? 'checked' : 'unchecked'" />{{ p.label }}
              </button>
            }
            <mat-divider />
            @for (r of rights; track r.permission) {
              <button mat-menu-item type="button" role="menuitemcheckbox" [attr.aria-checked]="has(r.permission)"
                      (click)="$event.stopPropagation(); toggle(r.permission)">
                <mat-pseudo-checkbox [state]="has(r.permission) ? 'checked' : 'unchecked'" />{{ r.label }}
              </button>
            }
            <mat-divider />
            <button mat-menu-item type="button" (click)="$event.stopPropagation(); setAll(true)"><lucide-icon name="circle-check" [size]="16" /> Tout cocher</button>
            <button mat-menu-item type="button" (click)="$event.stopPropagation(); setAll(false)"><lucide-icon name="x" [size]="16" /> Tout décocher</button>
          </mat-menu>
          <p class="muted small">
            Le menu n'affiche que les pages cochées, et le serveur refuse les autres. Accueil et Mon compte restent toujours accessibles.
            @if (d.role?.userCount) {Les utilisateurs de ce rôle ont les nouveaux droits dès leur prochaine action.}
          </p>
        </div>
      </form>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="role-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
})
export class RoleFormDialog {
  d = inject<{ role?: UserRoleView }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<RoleFormDialog>);
  private api = inject(ApiService);

  readonly pages = PAGE_RIGHTS;
  readonly rights = WRITE_RIGHTS;
  name = this.d.role?.name ?? '';
  selected = signal<ReadonlySet<Permission>>(new Set(this.d.role?.permissions ?? []));
  summary = computed(() => permissionSummary([...this.selected()]));
  busy = signal(false);
  error = signal('');

  has(p: Permission): boolean {
    return this.selected().has(p);
  }

  toggle(p: Permission): void {
    const next = new Set(this.selected());
    if (!next.delete(p)) next.add(p);
    this.selected.set(next);
  }

  setAll(on: boolean): void {
    this.selected.set(new Set(on ? [...this.pages, ...this.rights].map((x) => x.permission) : []));
  }

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      // menu order, so the server and the table list them the same way
      const permissions = [...this.pages, ...this.rights].map((x) => x.permission).filter((p) => this.has(p));
      const r = await this.api.save('roles', this.d.role?.id, { name: this.name, permissions });
      this.ref.close(r ?? true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
