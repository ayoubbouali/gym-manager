import { describe, expect, it } from 'vitest';
import {
  SiteClub,
  SiteSport,
  hhmm,
  isLive,
  minutes,
  nextSession,
  openState,
  openingHours,
  sessionWhen,
  sessions,
  tint,
  whatsapp,
} from './site-data';

const club = (phone: string, dialCode = '212'): SiteClub => ({
  name: 'Club',
  address: '',
  phone,
  dialCode,
  city: '',
  country: 'MA',
  currency: 'DH',
  hasLogo: false,
  today: '2026-11-28',
});

const sport = (id: number, name: string, schedules: [number, string, string][]): SiteSport => ({
  id,
  name,
  color: '#E53935',
  monthlyPrice: 200,
  capacity: 20,
  fillPercent: 0,
  coaches: [],
  schedules: schedules.map(([day, start, end]) => ({ day, start, end })),
});

const week = sessions([
  sport(1, 'Boxe', [
    [1, '18:00:00', '20:00:00'],
    [3, '18:00', '20:00'],
  ]),
  sport(2, 'Yoga', [
    [1, '09:00', '10:00'],
    [6, '10:00', '11:30'],
  ]),
]);

describe('site vitrine — horaires', () => {
  it('lit les heures avec ou sans secondes', () => {
    expect(minutes('18:30:00')).toBe(1110);
    expect(minutes('07:05')).toBe(425);
    expect(hhmm(1110)).toBe('18:30');
  });

  it('trie les séances par jour puis par heure', () => {
    expect(week.map((s) => `${s.day}-${s.sport.name}`)).toEqual([
      '1-Yoga',
      '1-Boxe',
      '3-Boxe',
      '6-Yoga',
    ]);
  });

  it("calcule l'amplitude de chaque jour, fermé sans séance", () => {
    const h = openingHours(week);
    expect(h[0]).toEqual({ start: 540, end: 1200 });
    expect(h[1]).toBeNull();
  });

  it('dit si le club est ouvert et quand il rouvre', () => {
    expect(openState(week, { day: 1, min: 600 })).toEqual({
      open: true,
      label: "Ouvert · jusqu'à 20:00",
    });
    expect(openState(week, { day: 1, min: 480 })?.label).toBe('Fermé · ouvre à 09:00');
    expect(openState(week, { day: 1, min: 1230 })?.label).toBe('Fermé · ouvre mercredi à 18:00');
    expect(openState(week, { day: 6, min: 1000 })?.label).toBe('Fermé · ouvre lundi à 09:00');
    expect(openState(week, { day: 5, min: 1000 })?.label).toBe('Fermé · ouvre demain à 10:00');
    expect(openState([], { day: 1, min: 0 })).toBeNull();
  });

  it('trouve la prochaine séance en bouclant sur la semaine', () => {
    expect(nextSession(week, { day: 1, min: 600 })?.sport.name).toBe('Boxe');
    expect(nextSession(week, { day: 6, min: 700 })?.day).toBe(1);
    expect(nextSession([], { day: 1, min: 0 })).toBeNull();
  });

  it('libelle le moment de la séance', () => {
    const boxe = week[1];
    expect(isLive(boxe, { day: 1, min: 1100 })).toBe(true);
    expect(sessionWhen(boxe, { day: 1, min: 1100 })).toBe('En ce moment');
    expect(sessionWhen(boxe, { day: 1, min: 600 })).toBe("Aujourd'hui · 18:00");
    expect(sessionWhen(boxe, { day: 7, min: 600 })).toBe('Demain · 18:00');
    expect(sessionWhen(week[2], { day: 1, min: 600 })).toBe('Mercredi · 18:00');
  });
});

describe('site vitrine — liens', () => {
  it('met le numéro WhatsApp au format international', () => {
    expect(whatsapp(club('06 62 49 18 05'), 'Salut')).toBe('https://wa.me/212662491805?text=Salut');
    expect(whatsapp(club('+33 6 12 34 56 78'), 'a b')).toBe('https://wa.me/33612345678?text=a%20b');
    expect(whatsapp(club('00212662491805'), 'x')).toBe('https://wa.me/212662491805?text=x');
    expect(whatsapp(club(''), 'x')).toBeNull();
  });

  it('ajoute une transparence à une couleur, rouge par défaut', () => {
    expect(tint('#E53935', 0.5)).toBe('#E5393580');
    expect(tint(null, 1)).toBe('#ff3b2fff');
  });
});
