import { Pipe, PipeTransform, inject } from '@angular/core';
import { ConfigService } from './config.service';

const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** 1234.5 → "1 234,50" (regular spaces for readability and CSV). */
export function formatAmount(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return (decimals === 0 ? nf0 : nf2).format(value).replace(/ | /g, ' ');
}

/** "2026-07-22" → "22/07/2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** "2026-09-12T18:00:00" → "12/09/2026 18:00" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${formatDate(iso)} ${iso.slice(11, 16)}`;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** "2026-05" → "mai 2026" */
export function formatMonth(ym: string, long = false): string {
  const [y, m] = ym.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
}

export function monthName(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private config = inject(ConfigService);
  transform(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined) return '—';
    return `${formatAmount(value, decimals)} ${this.config.currency()}`;
  }
}

@Pipe({ name: 'frDate' })
export class FrDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatDate(value);
  }
}

@Pipe({ name: 'frDateTime' })
export class FrDateTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatDateTime(value);
  }
}

/** Case- and accent-insensitive normalization for searches. */
export function norm(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export const SITUATION_LABELS: Record<string, string> = {
  EXPIRED: '⚠ Expiré',
  SOON: '⏳ Expire bientôt',
  FOLLOW: 'À suivre',
  OK: 'À jour',
  NONE: 'Sans abonnement',
};

export const MEMBER_STATE_LABELS: Record<string, string> = {
  EXPIRED: 'Expiré',
  UNPAID: 'En attente de paiement',
  SOON: 'Expire bientôt',
  UP_TO_DATE: 'À jour',
  NONE: 'Sans abonnement',
};

export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const PAYMENT_METHODS: { value: 'ESPECES' | 'CARTE' | 'VIREMENT'; label: string }[] = [
  { value: 'ESPECES', label: 'Espèces' },
  { value: 'CARTE', label: 'Carte bancaire' },
  { value: 'VIREMENT', label: 'Virement' },
];

export const PAYMENT_STATUS_LABELS: Record<string, string> = { PAYE: 'Payé', PARTIEL: 'Partiel', IMPAYE: 'Impayé' };

/** "2026-11" for a date "2026-11-18". */
export const monthOf = (iso: string) => iso.slice(0, 7);

/** PDF documents (receipts) open in a new tab, the session cookie authenticates them. */
export function openPdf(url: string): void {
  window.open(url, '_blank', 'noopener');
}
