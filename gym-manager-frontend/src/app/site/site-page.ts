import {
  Component,
  DestroyRef,
  ViewEncapsulation,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  LucideAngularModule,
  Menu,
  MessageCircle,
  X,
} from 'lucide-angular';
import { CountUp, Reveal } from './motion';
import { SiteCoaches } from './sections/coaches';
import { SiteContact } from './sections/contact';
import { SiteEvents } from './sections/events';
import { SitePlanning } from './sections/planning';
import { SitePricing } from './sections/pricing';
import { SiteSports } from './sections/sports';
import {
  SiteData,
  SiteDataService,
  hhmm,
  nextSession,
  now,
  openState,
  sessionWhen,
  sessions,
  tint,
  whatsapp,
} from './site-data';

interface NavLink {
  id: string;
  label: string;
  show: boolean;
}

/** Public showcase site of the club: who we are, what we teach, when, for how much, and how to reach us. */
@Component({
  selector: 'gm-site',
  imports: [
    RouterLink,
    LucideAngularModule,
    Reveal,
    CountUp,
    SiteSports,
    SitePlanning,
    SitePricing,
    SiteCoaches,
    SiteEvents,
    SiteContact,
  ],
  templateUrl: './site-page.html',
  styleUrls: ['./site-base.scss', './site-chrome.scss', './site-page.scss'],
  host: { class: 'gm-site' },
  // The base styles are shared by the section components; everything is scoped under .gm-site.
  encapsulation: ViewEncapsulation.None,
})
export class SitePage implements OnInit {
  private readonly api = inject(SiteDataService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = { ArrowRight, ArrowUpRight, Clock, Menu, MessageCircle, X };
  protected readonly data = signal<SiteData | null>(null);
  protected readonly failed = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly scrolled = signal(false);
  /** Re-evaluated every minute so "open now" and the next session stay true on an idle tab. */
  protected readonly clock = signal(now());

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
        coach: s.sport.coaches[0],
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
    ].filter((l) => l.show);
  });
  protected readonly glow = computed(() => {
    const colors = (this.data()?.sports ?? []).map((s) => s.color);
    return {
      a: tint(colors[0], 0.55),
      b: tint(colors[1] ?? colors[0], 0.45),
      c: tint(colors[2] ?? '#ff8a1f', 0.4),
    };
  });
  protected readonly cta = computed(() =>
    whatsapp(
      this.club(),
      `Bonjour ${this.club()?.name ?? ''}, je souhaite des informations pour m'inscrire.`,
    ),
  );
  /** The logo uploaded in the settings, otherwise the one shipped with the app. */
  protected readonly logo = computed(() =>
    this.club()?.hasLogo ? '/api/public/logo' : '/brand/logo.png',
  );
  protected readonly year = new Date().getFullYear();

  async ngOnInit(): Promise<void> {
    const timer = setInterval(() => this.clock.set(now()), 60_000);
    const onScroll = () => this.scrolled.set(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      window.removeEventListener('scroll', onScroll);
    });
    await this.reload();
  }

  protected async reload(): Promise<void> {
    this.failed.set(false);
    try {
      const d = await this.api.load();
      this.data.set(d);
      const where = d.club.city ? ` à ${d.club.city}` : '';
      this.title.setTitle(`${d.club.name} — Salle de sport${where}`);
      this.meta.updateTag({
        name: 'description',
        content: `${d.club.name}${where} : ${d.sports.map((s) => s.name).join(', ')}. Planning des cours, tarifs, coachs et événements.`,
      });
    } catch {
      this.failed.set(true);
    }
  }

  protected go(id: string): void {
    this.menuOpen.set(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected top(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
