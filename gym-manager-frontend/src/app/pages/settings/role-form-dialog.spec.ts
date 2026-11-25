import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import { APP_ICONS } from '../../core/icons';
import { Permission, UserRoleView } from '../../core/models';
import { visibleNav } from '../../layout/nav';
import { PAGE_RIGHTS, RoleFormDialog, permissionSummary } from './role-form-dialog';

describe('popup rôle : pages et droits', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function open(role?: UserRoleView) {
    api = { save: vi.fn().mockResolvedValue({}) };
    TestBed.configureTestingModule({
      imports: [RoleFormDialog],
      providers: [
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ApiService, useValue: api },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: { role } },
      ],
    });
    const f = TestBed.createComponent(RoleFormDialog);
    f.detectChanges();
    return f;
  }

  beforeEach(() => TestBed.resetTestingModule());

  it('propose toutes les pages du menu sauf Accueil, dans l’ordre du menu', () => {
    expect(PAGE_RIGHTS.map((p) => p.label)).toEqual(['Adhérents', 'Fiche adhérent', 'Packs', 'Remises & durées', 'Sports', 'Activités',
      'Personnel', 'Paie du personnel', 'Paiements', 'Alertes', 'Statistiques', 'Paramètres']);
  });

  it('envoie le nom et les cases cochées, dans l’ordre du menu', async () => {
    const f = open();
    const c = f.componentInstance;
    c.name = 'Coach';
    c.toggle('STATS');
    c.toggle('ACTIVITIES');
    c.toggle('EDIT_REFERENTIALS');
    c.toggle('STATS'); // unchecked again
    await c.save();
    expect(api['save']).toHaveBeenCalledWith('roles', undefined, { name: 'Coach', permissions: ['ACTIVITIES', 'EDIT_REFERENTIALS'] });
  });

  it('reprend les droits du rôle modifié, et « Tout décocher » les retire tous', async () => {
    const f = open({ id: 7, name: 'Accueil', permissions: ['MEMBERS', 'PAYMENTS'], userCount: 2 });
    const c = f.componentInstance;
    expect(c.has('MEMBERS')).toBe(true);
    expect(c.summary()).toBe('2 pages');
    c.setAll(false);
    await c.save();
    expect(api['save']).toHaveBeenCalledWith('roles', 7, { name: 'Accueil', permissions: [] });
  });

  it('résume les droits', () => {
    const all = [...PAGE_RIGHTS.map((p) => p.permission), 'MANAGE_PAYMENTS'] as Permission[];
    expect(permissionSummary(all)).toBe('Toutes les pages · 1 droit de modification');
    expect(permissionSummary(['MEMBERS'])).toBe('1 page');
  });
});

describe('menu selon les droits', () => {
  it('garde Accueil, retire les pages non accordées et les groupes vides', () => {
    const granted = new Set<Permission>(['PAYMENTS']);
    const nav = visibleNav((p) => granted.has(p));
    expect(nav.flatMap((g) => g.items.map((i) => i.label))).toEqual(['Accueil', 'Paiements']);
    expect(nav.map((g) => g.label)).toEqual([null, 'Suivi']);
  });
});
