import { Component, computed, input, signal } from '@angular/core';
import { Check, LucideAngularModule, MessageCircle, Sparkles } from 'lucide-angular';
import { Reveal } from '../motion';
import { SiteData, money, whatsapp } from '../site-data';

interface Offer {
  key: string;
  sport: string;
  color: string;
  title: string;
  perMonth: string;
  total: string | null;
  saving: string | null;
  percent: number;
  link: string | null;
  best: boolean;
}

@Component({
  selector: 'gm-site-pricing',
  imports: [LucideAngularModule, Reveal],
  host: { class: 'section' },
  template: `
    <div class="wrap">
      <div class="section-head">
        <div reveal>
          <p class="kicker">Tarifs</p>
          <h2 class="section-title">Des formules <em>claires.</em></h2>
        </div>
        <p class="section-lead" [reveal]="120">
          Pas de frais cachés.
          @if (maxDiscount() > 0) {
            Plus tu t'engages, plus tu économises : jusqu'à <strong>-{{ maxDiscount() }} %</strong>.
          }
        </p>
      </div>

      @if (durations().length > 1) {
        <div class="switch" reveal>
          <div class="segmented" role="group" aria-label="Durée d'engagement">
            @for (d of durations(); track d.months) {
              <button
                type="button"
                [class.on]="months() === d.months"
                [attr.aria-pressed]="months() === d.months"
                (click)="chosen.set(d.months)"
              >
                {{ d.label }}
                @if (d.discount > 0) {
                  <span class="off">-{{ d.discount }}%</span>
                }
              </button>
            }
          </div>
        </div>
      }

      <div class="offers">
        @for (o of offers(); track o.key; let i = $index) {
          <article
            class="s-card offer"
            [class.best]="o.best"
            [style.--c]="o.color"
            [reveal]="(i % 3) * 80"
          >
            @if (o.best) {
              <p class="ribbon">
                <lucide-icon [img]="icons.Sparkles" [size]="13" />Meilleure économie
              </p>
            }
            <p class="sport"><span class="sw"></span>{{ o.sport }}</p>
            <h3>{{ o.title }}</h3>
            <p class="amount">{{ o.perMonth }}<small>/mois</small></p>
            <ul>
              @if (o.total) {
                <li><lucide-icon [img]="icons.Check" [size]="16" />{{ o.total }}</li>
              }
              @if (o.saving) {
                <li class="save"><lucide-icon [img]="icons.Check" [size]="16" />{{ o.saving }}</li>
              }
              <li>
                <lucide-icon [img]="icons.Check" [size]="16" />Accès à tous les créneaux de la
                discipline
              </li>
            </ul>
            @if (o.link) {
              <a
                class="btn"
                [class.btn-primary]="o.best"
                [class.btn-ghost]="!o.best"
                [href]="o.link"
                target="_blank"
                rel="noopener"
              >
                <lucide-icon [img]="icons.MessageCircle" [size]="18" />Je choisis cette formule
              </a>
            }
          </article>
        } @empty {
          <p class="empty">Aucune formule pour cette durée.</p>
        }
      </div>
      <p class="s-note">Tarifs indicatifs, confirmés à l'inscription à l'accueil du club.</p>
    </div>
  `,
  styleUrl: './pricing.scss',
})
export class SitePricing {
  readonly data = input.required<SiteData>();
  protected readonly icons = { Check, MessageCircle, Sparkles };
  protected readonly chosen = signal<number | null>(null);

  protected readonly durations = computed(() => {
    const by = new Map<number, { months: number; label: string; discount: number }>();
    for (const p of this.data().packs) {
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
  protected readonly months = computed(() => this.chosen() ?? this.durations()[0]?.months ?? 1);
  protected readonly maxDiscount = computed(() =>
    Math.max(0, ...this.durations().map((d) => d.discount)),
  );

  protected readonly offers = computed<Offer[]>(() => {
    const { packs, sports, club } = this.data();
    const cur = club.currency;
    const ask = (what: string) =>
      whatsapp(
        club,
        `Bonjour, je suis intéressé(e) par la formule « ${what} ». Pouvez-vous m'en dire plus ?`,
      );
    if (!packs.length) {
      // No pack configured yet: the monthly price of each sport.
      return sports.map((s) => ({
        key: `s${s.id}`,
        sport: s.name,
        color: s.color,
        title: 'Mensuel',
        perMonth: money(s.monthlyPrice, cur),
        total: null,
        saving: null,
        percent: 0,
        link: ask(`${s.name} — mensuel`),
        best: false,
      }));
    }
    const list = packs
      .filter((p) => p.months === this.months())
      .map((p) => {
        const full = p.monthlyPrice * p.months;
        const saved = full - p.total;
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
    if (top > 0 && list.length > 1) {
      const best = list.find((o) => o.percent === top);
      if (best) best.best = true;
    }
    return list;
  });

  protected readonly money = money;
}
