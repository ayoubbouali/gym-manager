import { Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { saveBlob } from '../../core/csv';
import { NotifyService } from '../../core/notify.service';
import { openSimpleForm } from '../../shared/simple-form-dialog';

const EXISTING_LABELS: Record<string, string> = {
  members: 'adhérent(s)', payments: 'paiement(s)', sports: 'sport(s)', staff: 'membre(s) du personnel', packs: 'pack(s)',
  activities: 'activité(s)', salaryPayments: 'versement(s) de salaire',
};

/** Paramètres › Données: backup export, backup restore and full reset. */
@Component({
  selector: 'app-data-import',
  imports: [MatButtonModule, LucideAngularModule],
  template: `
    <section class="data-section">
      <h3><lucide-icon name="download" [size]="18" /> Exporter la base</h3>
      <p class="muted">Télécharge une sauvegarde complète (fichier <b>.zip</b>) : adhérents, paiements, sports, personnel, packs, référentiels,
        activités, paie, paramètres, photos et logo. Les comptes utilisateurs ne sont pas inclus.</p>
      <button mat-flat-button (click)="export()" [disabled]="busy()"><lucide-icon name="download" [size]="16" /> Exporter la base</button>
    </section>

    <section class="data-section">
      <h3><lucide-icon name="upload" [size]="18" /> Importer une sauvegarde</h3>
      <p class="muted">Remplace <b>toutes</b> les données actuelles par celles d'un fichier produit par « Exporter la base ».
        Les comptes utilisateurs sont conservés. En cas d'erreur, rien n'est modifié.</p>
      <label class="photo-btn file-pick">
        <lucide-icon name="upload" [size]="16" /> Importer une sauvegarde…
        <input type="file" accept=".zip,application/zip" class="sr-only" [disabled]="busy()" (change)="restore($event)" />
      </label>
    </section>

    <section class="data-section">
      <h3><lucide-icon name="trash-2" [size]="18" /> Réinitialiser les données</h3>
      <p class="muted">Supprime adhérents, paiements, sports, personnel, packs, remises, durées, activités et paie, et remet les numéros à zéro.
        Les données de base (fonctions, durées, remises) sont recréées ; les comptes utilisateurs, les paramètres et le logo sont conservés.</p>
      <button mat-stroked-button class="btn-outline-danger" (click)="wipe()"><lucide-icon name="trash-2" [size]="16" /> Effacer toutes les données…</button>
    </section>
  `,
})
export class DataImport {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  busy = signal(false);

  async export(): Promise<void> {
    this.busy.set(true);
    try {
      const blob = await this.api.download('/data/export');
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      saveBlob(blob, `gym-manager-${day}.zip`);
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async restore(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await this.existingText();
    const ok = await openSimpleForm(this.dialog, {
      title: `Importer « ${file.name} » ?`,
      fields: [{ key: 'confirm', label: 'Tapez SUPPRIMER pour confirmer', required: true,
        hint: `Toutes les données actuelles seront remplacées (${text}). Irréversible.` }],
      value: { confirm: '' },
      submit: (v) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('confirm', String(v['confirm'] ?? ''));
        return this.api.postForm('/data/restore', fd);
      },
    });
    if (ok) {
      await this.config.load();
      this.notify.success('Sauvegarde importée : les données du fichier ont remplacé les données actuelles.');
    }
  }

  async wipe(): Promise<void> {
    const text = await this.existingText();
    const ok = await openSimpleForm(this.dialog, {
      title: 'Effacer toutes les données du club ?',
      fields: [{ key: 'confirm', label: 'Tapez SUPPRIMER pour confirmer', required: true, hint: `Sera supprimé : ${text}. Irréversible.` }],
      value: { confirm: '' },
      submit: (v) => this.api.post('/data/wipe', { confirm: v['confirm'] }),
    });
    if (ok) {
      this.notify.success('Toutes les données du club ont été effacées.');
    }
  }

  private async existingText(): Promise<string> {
    const summary = await this.api.get<Record<string, number>>('/data/summary');
    return Object.entries(summary).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${EXISTING_LABELS[k] ?? k}`).join(', ') || 'aucune donnée';
  }
}
