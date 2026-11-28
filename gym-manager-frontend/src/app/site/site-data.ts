import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface SiteClub {
  name: string;
  address: string;
  phone: string;
  dialCode: string;
  city: string;
  country: string;
  currency: string;
  hasLogo: boolean;
  today: string;
}

export interface SiteSlot {
  day: number;
  start: string;
  end: string;
}

export interface SiteSport {
  id: number;
  name: string;
  color: string;
  monthlyPrice: number;
  capacity: number;
  fillPercent: number;
  coaches: string[];
  schedules: SiteSlot[];
}

export interface SitePack {
  id: number;
  name: string;
  sportId: number;
  sport: string;
  sportColor: string;
  months: number;
  duration: string;
  monthlyPrice: number;
  discountPercent: number;
  total: number;
}

export interface SiteCoach {
  id: number;
  name: string;
  initials: string;
  role: string;
  sports: string[];
  hasPhoto: boolean;
}

export interface SiteEvent {
  id: number;
  name: string;
  description: string;
  price: number;
  startsAt: string;
  location: string;
  maxPlaces: number | null;
  remainingPlaces: number | null;
  full: boolean;
}

export interface SiteData {
  club: SiteClub;
  sports: SiteSport[];
  packs: SitePack[];
  coaches: SiteCoach[];
  events: SiteEvent[];
}

/** A session of the week, flattened from the sports' schedules. */
export interface Session {
  sport: SiteSport;
  day: number;
  start: number;
  end: number;
}

@Injectable({ providedIn: 'root' })
export class SiteDataService {
  private readonly http = inject(HttpClient);

  load(): Promise<SiteData> {
    return firstValueFrom(this.http.get<SiteData>('/api/public/site'));
  }
}

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** "18:30:00" or "18:30" → minutes since midnight. */
export function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function hhmm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** ISO day of week (1 = Monday) and minutes since midnight, on the visitor's clock. */
export function now(date = new Date()): { day: number; min: number } {
  return { day: ((date.getDay() + 6) % 7) + 1, min: date.getHours() * 60 + date.getMinutes() };
}

export function sessions(sports: SiteSport[]): Session[] {
  return sports
    .flatMap((sport) =>
      sport.schedules.map((s) => ({
        sport,
        day: s.day,
        start: minutes(s.start),
        end: minutes(s.end),
      })),
    )
    .sort((a, b) => a.day - b.day || a.start - b.start);
}

/** Opening span of each day (1..7), from the first session to the last one; null when nothing is scheduled. */
export function openingHours(all: Session[]): ({ start: number; end: number } | null)[] {
  return [1, 2, 3, 4, 5, 6, 7].map((day) => {
    const of = all.filter((s) => s.day === day);
    if (!of.length) return null;
    return { start: Math.min(...of.map((s) => s.start)), end: Math.max(...of.map((s) => s.end)) };
  });
}

/** Next session starting after the given moment, wrapping around the week. */
export function nextSession(all: Session[], at = now()): Session | null {
  if (!all.length) return null;
  const key = (s: Session) => ((s.day - at.day + 7) % 7) * 1440 + s.start - at.min;
  const ahead = all.map((s) => ({ s, k: key(s) <= 0 ? key(s) + 7 * 1440 : key(s) }));
  return ahead.sort((a, b) => a.k - b.k)[0].s;
}

export function isLive(s: Session, at = now()): boolean {
  return s.day === at.day && at.min >= s.start && at.min < s.end;
}

export interface OpenState {
  open: boolean;
  label: string;
}

export function openState(all: Session[], at = now()): OpenState | null {
  const hours = openingHours(all);
  if (hours.every((h) => !h)) return null;
  const today = hours[at.day - 1];
  if (today && at.min >= today.start && at.min < today.end)
    return { open: true, label: `Ouvert · jusqu'à ${hhmm(today.end)}` };
  if (today && at.min < today.start)
    return { open: false, label: `Fermé · ouvre à ${hhmm(today.start)}` };
  for (let i = 1; i <= 7; i++) {
    const day = ((at.day - 1 + i) % 7) + 1;
    const h = hours[day - 1];
    if (h)
      return {
        open: false,
        label: `Fermé · ouvre ${i === 1 ? 'demain' : DAYS[day - 1].toLowerCase()} à ${hhmm(h.start)}`,
      };
  }
  return null;
}

export function sessionWhen(s: Session, at = now()): string {
  if (isLive(s, at)) return 'En ce moment';
  const diff = (s.day - at.day + 7) % 7;
  const day =
    diff === 0 && s.start > at.min ? "Aujourd'hui" : diff === 1 ? 'Demain' : DAYS[s.day - 1];
  return `${day} · ${hhmm(s.start)}`;
}

const NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function money(value: number | null | undefined, currency: string): string {
  return `${NUMBER.format(Math.round(value ?? 0))} ${currency}`.trim();
}

/** wa.me link: the club phone in international form, with a prefilled message. */
export function whatsapp(club: SiteClub | undefined, text: string): string | null {
  if (!club?.phone) return null;
  const raw = club.phone.trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else {
    const dial = (club.dialCode ?? '').replace(/\D/g, '');
    if (dial) digits = dial + digits.replace(/^0/, '');
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function tel(club: SiteClub | undefined): string | null {
  return club?.phone ? `tel:${club.phone.replace(/[^\d+]/g, '')}` : null;
}

export function maps(club: SiteClub | undefined): string | null {
  const q = [club?.name, club?.address, club?.city].filter(Boolean).join(', ');
  return club?.address || club?.city
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
    : null;
}

/** A hex color with an alpha channel, for glows and tints; falls back to the brand red. */
export function tint(color: string | null | undefined, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color ?? '')?.[1] ?? 'ff3b2f';
  return `#${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}
