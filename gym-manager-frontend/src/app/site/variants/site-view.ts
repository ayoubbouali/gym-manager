import { DestroyRef, Directive, OnInit, computed, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import {
  DAYS,
  DAYS_SHORT,
  SiteData,
  SiteDataService,
  coachPhotoUrl,
  hhmm,
  logoUrl,
  maps,
  money,
  nextSession,
  now,
  openState,
  openingHours,
  sessionWhen,
  sessions,
  isLive,
  tel,
  tint,
  whatsapp,
} from '../site-data';

const DAY = new Intl.DateTimeFormat('fr-FR', { day: '2-digit' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });
const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export interface NavLink {
  id: string;
  label: string;
}

/**
 * Data loading and view models shared by the alternative showcase designs (/club2 … /club5),
 * so each design only brings its own template and styles.
 */
@Directive()
export abstract class SiteView implements OnInit {
  private readonly api = inject(SiteDataService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly days = DAYS;
  protected readonly daysShort = DAYS_SHORT;
  protected readonly hhmm = hhmm;
  protected readonly year = new Date().getFullYear();

  protected readonly data = signal<SiteData | null>(null);
  protected readonly failed = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly scrolled = signal(false);
  protected readonly clock = signal(now());
  /** Day shown by the planning (1 = Monday); today until the visitor picks another one. */
  protected readonly chosenDay = signal<number | null>(null);
  /** Pack duration shown by the pricing; the shortest one until the visitor picks another. */
  protected readonly chosenMonths = signal<number | null>(null);

  protected readonly club = computed(() => this.data()?.club);
  protected readonly all = computed(() => sessions(this.data()?.sports ?? []));
  protected readonly open = computed(() => openState(this.all(), this.clock()));
  protected readonly next = computed(() => {
    const s = nextSession(this.all(), this.clock());
    return (
      s && {
        name: s.sport.name,
        color: s.sport.color,
        when: sessionWhen(s, this.clock()),
        until: hhmm(s.end),
        coach: s.sport.coaches[0] ?? null,
      }
    );
  });
  protected readonly stats = computed(() => {
    const d = this.data();
    const all = this.all();
    return [
      { value: d?.sports.length ?? 0, label: 'disciplines' },
      { value: d?.coaches.length ?? 0, label: 'coachs' },
      { value: all.length, label: 'séances / semaine' },
      {
        value: Math.round(all.reduce((t, s) => t + s.end - s.start, 0) / 60),
        label: 'heures de cours / semaine',
      },
    ].filter((s) => s.value > 0);
  });
  protected readonly links = computed<NavLink[]>(() => {
    const d = this.data();
    return [
      { id: 'disciplines', label: 'Disciplines', show: !!d?.sports.length },
      { id: 'planning', label: 'Planning', show: this.all().length > 0 },
      { id: 'tarifs', label: 'Tarifs', show: !!(d?.packs.length || d?.sports.length) },
      { id: 'coachs', label: 'Coachs', show: !!d?.coaches.length },
      { id: 'evenements', label: 'Événements', show: !!d?.events.length },
      { id: 'contact', label: 'Contact', show: true },
    ]
      .filter((l) => l.show)
      .map(({ id, label }) => ({ id, label }));
  });
  protected readonly cta = computed(() =>
    whatsapp(
      this.club(),
      `Bonjour ${this.club()?.name ?? ''}, je souhaite des informations pour m'inscrire.`,
    ),
  );
  protected readonly phone = computed(() => tel(this.club()));
  protected readonly phoneLabel = computed(() => this.club()?.phone ?? '');
  protected readonly map = computed(() => maps(this.club()));
  protected readonly logo = computed(() => logoUrl(this.club()));
  /** Brand palette derived from the sports' colors. */
  protected readonly palette = computed(() => {
    const colors = (this.data()?.sports ?? []).map((s) => s.color);
    return {
      a: colors[0] ?? '#ff3b2f',
      b: colors[1] ?? colors[0] ?? '#ff8a1f',
      c: colors[2] ?? '#ffd23f',
    };
  });

  protected readonly sports = computed(() => {
    const d = this.data();
    if (!d) return [];
    const at = this.clock();
    return d.sports.map((s) => {
      const own = sessions([s]);
      const next = nextSession(own, at);
      const hours = own.reduce((t, x) => t + x.end - x.start, 0) / 60;
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        soft: tint(s.color, 0.16),
        coaches: s.coaches,
        days: new Set(s.schedules.map((x) => x.day)),
        sessionsCount: own.length,
        hours: +hours.toFixed(1),
        weekly: own.length
          ? `${own.length} séance${own.length > 1 ? 's' : ''} · ${+hours.toFixed(1)} h / semaine`
          : 'Planning sur demande',
        next: next ? sessionWhen(next, at) : null,
        price: money(s.monthlyPrice, d.club.currency),
        fillPercent: s.fillPercent,
        live: own.some((x) => isLive(x, at)),
      };
    });
  });

  /** Planning: every session of the chosen day, plus a per-day count for the day picker. */
  protected readonly planDay = computed(() => this.chosenDay() ?? this.clock().day);
  protected readonly week = computed(() =>
    DAYS.map((label, i) => ({
      day: i + 1,
      label,
      short: DAYS_SHORT[i],
      count: this.all().filter((s) => s.day === i + 1).length,
      today: i + 1 === this.clock().day,
    })),
  );
  protected readonly daySessions = computed(() =>
    this.all()
      .filter((s) => s.day === this.planDay())
      .map((s) => ({
        key: `${s.sport.id}-${s.day}-${s.start}`,
        sport: s.sport.name,
        color: s.sport.color,
        coach: s.sport.coaches.join(' · '),
        start: hhmm(s.start),
        end: hhmm(s.end),
        duration: s.end - s.start,
        live: isLive(s, this.clock()),
        past: s.day === this.clock().day && s.end <= this.clock().min,
      })),
  );
  /** Whole-week grid: for each day, its sessions (for designs that show the week at once). */
  protected readonly weekGrid = computed(() =>
    DAYS.map((label, i) => ({
      day: i + 1,
      label,
      short: DAYS_SHORT[i],
      today: i + 1 === this.clock().day,
      sessions: this.all()
        .filter((s) => s.day === i + 1)
        .map((s) => ({
          key: `${s.sport.id}-${s.start}`,
          sport: s.sport.name,
          color: s.sport.color,
          start: hhmm(s.start),
          end: hhmm(s.end),
          live: isLive(s, this.clock()),
        })),
    })),
  );

  protected readonly durations = computed(() => {
    const by = new Map<number, { months: number; label: string; discount: number }>();
    for (const p of this.data()?.packs ?? []) {
      const d = by.get(p.months) ?? {
        months: p.months,
        label: p.duration || `${p.months} mois`,
        discount: 0,
      };
      d.discount = Math.max(d.discount, Math.round(p.discountPercent ?? 0));
      by.set(p.months, d);
    }
    return [...by.values()].sort((a, b) => a.months - b.months);
  });
  protected readonly months = computed(
    () => this.chosenMonths() ?? this.durations()[0]?.months ?? 1,
  );
  /** Offers for the chosen duration; the monthly price of each sport when no pack is configured. */
  protected readonly offers = computed(() => {
    const d = this.data();
    if (!d) return [];
    const { packs, sports, club } = d;
    const cur = club.currency;
    const ask = (what: string) =>
      whatsapp(
        club,
        `Bonjour, je suis intéressé(e) par la formule « ${what} ». Pouvez-vous m'en dire plus ?`,
      );
    if (!packs.length) {
      return sports.map((s) => ({
        key: `s${s.id}`,
        sport: s.name,
        color: s.color,
        title: 'Mensuel',
        perMonth: money(s.monthlyPrice, cur),
        total: null as string | null,
        saving: null as string | null,
        percent: 0,
        link: ask(`${s.name} — mensuel`),
        best: false,
      }));
    }
    const list = packs
      .filter((p) => p.months === this.months())
      .map((p) => {
        const saved = p.monthlyPrice * p.months - p.total;
        return {
          key: `p${p.id}`,
          sport: p.sport,
          color: p.sportColor,
          title: p.name,
          perMonth: money(p.total / Math.max(1, p.months), cur),
          total:
            p.months > 1
              ? `${money(p.total, cur)} pour ${p.months} mois`
              : `${money(p.total, cur)} le mois`,
          saving:
            saved > 0.5
              ? `${money(saved, cur)} économisés (-${Math.round(p.discountPercent)} %)`
              : null,
          percent: p.discountPercent ?? 0,
          link: ask(p.name),
          best: false,
        };
      });
    const top = Math.max(0, ...list.map((o) => o.percent));
    const best = top > 0 && list.length > 1 ? list.find((o) => o.percent === top) : undefined;
    if (best) best.best = true;
    return list;
  });

  protected readonly coaches = computed(() => {
    const d = this.data();
    if (!d) return [];
    const color = new Map(d.sports.map((s) => [s.name, s.color]));
    return d.coaches.map((c) => {
      const tags = c.sports.map((name) => ({ name, color: color.get(name) ?? '#ff3b2f' }));
      return {
        id: c.id,
        name: c.name,
        initials: c.initials,
        role: c.role,
        photo: coachPhotoUrl(c),
        sports: tags,
        color: tags[0]?.color ?? '#ff3b2f',
      };
    });
  });

  protected readonly events = computed(() => {
    const d = this.data();
    if (!d) return [];
    return d.events.map((e) => {
      const at = new Date(e.startsAt);
      const taken = e.maxPlaces
        ? Math.min(100, ((e.maxPlaces - (e.remainingPlaces ?? 0)) / e.maxPlaces) * 100)
        : 0;
      return {
        ...e,
        day: DAY.format(at),
        month: MONTH.format(at).replace('.', ''),
        weekday: WEEKDAY.format(at),
        time: TIME.format(at),
        taken,
        priceLabel: e.price > 0 ? money(e.price, d.club.currency) : 'Gratuit',
        link: whatsapp(
          d.club,
          `Bonjour, je souhaite réserver une place pour « ${e.name} » du ${DAY.format(at)} ${MONTH.format(at)}.`,
        ),
      };
    });
  });

  /** Opening span of each day, Monday first: { label, hours: "08:00 – 21:00" | null, today }. */
  protected readonly hours = computed(() =>
    openingHours(this.all()).map((h, i) => ({
      label: DAYS[i],
      short: DAYS_SHORT[i],
      hours: h ? `${hhmm(h.start)} – ${hhmm(h.end)}` : null,
      today: i + 1 === this.clock().day,
    })),
  );
  protected readonly hasHours = computed(() => this.hours().some((h) => h.hours));

  ngOnInit(): void {
    const timer = setInterval(() => this.clock.set(now()), 60_000);
    const onScroll = () => this.scrolled.set(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      window.removeEventListener('scroll', onScroll);
    });
    // Shows the site, then every change made in the administration while the page stays open.
    this.api.follow(this.destroyRef, (d) => this.show(d), () => this.failed.set(true));
  }

  protected async reload(): Promise<void> {
    this.failed.set(false);
    try {
      this.show(await this.api.load());
    } catch {
      this.failed.set(true);
    }
  }

  private show(d: SiteData): void {
    this.failed.set(false);
    this.data.set(d);
    const where = d.club.city ? ` à ${d.club.city}` : '';
    this.title.setTitle(`${d.club.name} — Salle de sport${where}`);
    this.meta.updateTag({
      name: 'description',
      content: `${d.club.name}${where} : ${d.sports.map((s) => s.name).join(', ')}. Planning des cours, tarifs, coachs et événements.`,
    });
  }

  protected go(id: string): void {
    this.menuOpen.set(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected top(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
