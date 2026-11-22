import { EnvironmentProviders, Injectable, Provider, makeEnvironmentProviders } from '@angular/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, MAT_NATIVE_DATE_FORMATS, MatDateFormats, NativeDateAdapter } from '@angular/material/core';

/** Formats understood by FrDateAdapter for the text of the input. */
export const DAY_FORMAT = 'dd/MM/yyyy';
export const MONTH_FORMAT = 'MM/yyyy';

const DAY_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const MONTH_RE = /^(\d{1,2})[/.-](\d{4})$/;
const ISO_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date, or null when the parts do not form a real date (31/02 would otherwise overflow into March). */
export function localDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const date = new Date(y, m - 1, d);
  date.setFullYear(y);
  return date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

/** 'yyyy-mm-dd' or 'yyyy-mm' -> local Date (never through `new Date(iso)`, which reads it as UTC). */
export function isoToDate(iso: string | null | undefined): Date | null {
  const m = ISO_RE.exec(iso ?? '');
  return m ? localDate(+m[1], +m[2], m[3] ? +m[3] : 1) : null;
}

/** Local Date -> 'yyyy-mm-dd' (or 'yyyy-mm'), without toISOString() and its timezone shift. */
export function dateToIso(date: Date | null, month = false): string | null {
  if (!date || isNaN(date.getTime())) return null;
  const ym = `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}`;
  return month ? ym : `${ym}-${pad(date.getDate())}`;
}

/** Native adapter with French input text (jj/mm/aaaa, mm/aaaa) and weeks starting on Monday. */
@Injectable()
export class FrDateAdapter extends NativeDateAdapter {
  override getFirstDayOfWeek(): number {
    return 1;
  }

  override parse(value: unknown, parseFormat?: unknown): Date | null {
    if (value instanceof Date) return value;
    if (typeof value !== 'string') return value == null ? null : this.invalid();
    const text = value.trim();
    if (!text) return null;
    if (parseFormat === MONTH_FORMAT) {
      const m = MONTH_RE.exec(text);
      return (m && localDate(+m[2], +m[1], 1)) || isoToDate(text) || this.invalid();
    }
    const m = DAY_RE.exec(text);
    return (m && localDate(+m[3], +m[2], +m[1])) || (/^\d{4}-\d{2}-\d{2}$/.test(text) ? isoToDate(text) : null) || this.invalid();
  }

  override format(date: Date, displayFormat: object | string): string {
    if (!this.isValid(date)) throw Error('FrDateAdapter: cannot format invalid date.');
    const y = String(date.getFullYear()).padStart(4, '0');
    if (displayFormat === DAY_FORMAT) return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${y}`;
    if (displayFormat === MONTH_FORMAT) return `${pad(date.getMonth() + 1)}/${y}`;
    return super.format(date, displayFormat as object);
  }

  override deserialize(value: unknown): Date | null {
    if (typeof value === 'string' && ISO_RE.test(value)) return isoToDate(value) ?? this.invalid();
    return super.deserialize(value);
  }
}

export const FR_DATE_FORMATS: MatDateFormats = {
  ...MAT_NATIVE_DATE_FORMATS,
  parse: { ...MAT_NATIVE_DATE_FORMATS.parse, dateInput: DAY_FORMAT },
  display: { ...MAT_NATIVE_DATE_FORMATS.display, dateInput: DAY_FORMAT },
};

@Injectable()
export class FrDatepickerIntl extends MatDatepickerIntl {
  override calendarLabel = 'Calendrier';
  override openCalendarLabel = 'Ouvrir le calendrier';
  override closeCalendarLabel = 'Fermer le calendrier';
  override prevMonthLabel = 'Mois précédent';
  override nextMonthLabel = 'Mois suivant';
  override prevYearLabel = 'Année précédente';
  override nextYearLabel = 'Année suivante';
  override prevMultiYearLabel = '24 années précédentes';
  override nextMultiYearLabel = '24 années suivantes';
  override switchToMonthViewLabel = 'Choisir la date';
  override switchToMultiYearViewLabel = 'Choisir le mois et l’année';
  override startDateLabel = 'Date de début';
  override endDateLabel = 'Date de fin';
  override formatYearRangeLabel(start: string, end: string): string {
    return `${start} à ${end}`;
  }
}

export const FR_DATE_PROVIDERS: Provider[] = [
  { provide: MAT_DATE_LOCALE, useValue: 'fr-FR' },
  { provide: DateAdapter, useClass: FrDateAdapter },
  { provide: MAT_DATE_FORMATS, useValue: FR_DATE_FORMATS },
  { provide: MatDatepickerIntl, useClass: FrDatepickerIntl },
];

/** French date adapter, formats and calendar labels for every mat-datepicker of the app. */
export function provideFrDates(): EnvironmentProviders {
  return makeEnvironmentProviders(FR_DATE_PROVIDERS);
}
