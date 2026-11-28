import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SiteClub,
  SiteData,
  SiteDataService,
  SiteSport,
  coachPhotoUrl,
  logoUrl,
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
  logoVersion: null,
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

/** Stands in for the browser's EventSource: the test plays the server's announcements. */
class FakeEventSource {
  static last: FakeEventSource;
  closed = false;
  private listener?: (e: MessageEvent<string>) => void;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(_type: string, l: (e: MessageEvent<string>) => void): void {
    this.listener = l;
  }
  close(): void {
    this.closed = true;
  }
  announce(version: string): void {
    this.listener?.({ data: version } as MessageEvent<string>);
  }
}

describe('Mise à jour en direct du site', () => {
  const site = (version: string) => ({ version }) as SiteData;
  const flush = () => new Promise((r) => setTimeout(r));

  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    vi.stubGlobal('EventSource', FakeEventSource);
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(SiteDataService);
    const load = vi.spyOn(service, 'load');
    let destroy = () => {};
    const ref = { onDestroy: (fn: () => void) => (destroy = fn) } as unknown as DestroyRef;
    const shown: string[] = [];
    const failed = vi.fn();
    return { service, load, ref, shown, failed, destroy: () => destroy() };
  }

  it("recharge les données quand le serveur annonce une nouvelle version, avec la version dans l'URL", async () => {
    const t = setup();
    t.load.mockResolvedValueOnce(site('a')).mockResolvedValueOnce(site('b'));
    t.service.follow(t.ref, (d) => t.shown.push(d.version), t.failed);
    await flush();
    expect(FakeEventSource.last.url).toBe('/api/public/site/events');

    FakeEventSource.last.announce('a');
    await flush();
    expect(t.load).toHaveBeenCalledTimes(1);

    FakeEventSource.last.announce('b');
    await flush();
    expect(t.load).toHaveBeenLastCalledWith('b');
    expect(t.shown).toEqual(['a', 'b']);
  });

  it("un rafraîchissement raté garde la page affichée ; seul l'échec du premier chargement affiche l'erreur", async () => {
    const t = setup();
    t.load.mockResolvedValueOnce(site('a')).mockRejectedValueOnce(new Error('réseau'));
    t.service.follow(t.ref, (d) => t.shown.push(d.version), t.failed);
    await flush();
    FakeEventSource.last.announce('b');
    await flush();
    expect(t.shown).toEqual(['a']);
    expect(t.failed).not.toHaveBeenCalled();
  });

  it('ferme le flux quand la page est quittée', async () => {
    const t = setup();
    t.load.mockResolvedValue(site('a'));
    t.service.follow(t.ref, () => {}, t.failed);
    t.destroy();
    expect(FakeEventSource.last.closed).toBe(true);
  });

  it("l'adresse du logo et des photos change quand le fichier est remplacé", () => {
    expect(logoUrl({ ...club(''), hasLogo: true, logoVersion: 'x1' })).toBe('/api/public/logo?v=x1');
    expect(logoUrl(club(''))).toBe('/brand/logo.png');
    const coach = { id: 3, name: 'A', initials: 'A', role: 'Coach', sports: [], hasPhoto: true, photoVersion: 'p2' };
    expect(coachPhotoUrl(coach)).toBe('/api/public/coaches/3/photo?v=p2');
    expect(coachPhotoUrl({ ...coach, hasPhoto: false })).toBeNull();
  });
});
