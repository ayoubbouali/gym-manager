import { Component, computed, input } from '@angular/core';
import { Clock, LucideAngularModule, MapPin, MessageCircle } from 'lucide-angular';
import { Reveal } from '../motion';
import { SiteData, money, whatsapp } from '../site-data';

const DAY = new Intl.DateTimeFormat('fr-FR', { day: '2-digit' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });
const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

@Component({
  selector: 'gm-site-events',
  imports: [LucideAngularModule, Reveal],
  host: { class: 'section' },
  template: `
    <div class="wrap">
      <div class="section-head">
        <div reveal>
          <p class="kicker">À venir</p>
          <h2 class="section-title">Les <em>événements</em> du club.</h2>
        </div>
        <p class="section-lead" [reveal]="120">
          Stages, compétitions, sorties : les moments forts à ne pas manquer. Les places partent
          vite.
        </p>
      </div>

      <div class="events">
        @for (e of events(); track e.id; let i = $index) {
          <article class="s-card event" [class.full]="e.full" [reveal]="(i % 2) * 90">
            <div class="date" aria-hidden="true">
              <strong>{{ e.day }}</strong><span>{{ e.month }}</span>
            </div>
            <div class="body">
              <div class="meta">
                <span
                  ><lucide-icon [img]="icons.Clock" [size]="14" />{{ e.weekday }} ·
                  {{ e.time }}</span
                >
                @if (e.location) {
                  <span><lucide-icon [img]="icons.MapPin" [size]="14" />{{ e.location }}</span>
                }
              </div>
              <h3>{{ e.name }}</h3>
              @if (e.description) {
                <p class="desc">{{ e.description }}</p>
              }
              @if (e.maxPlaces) {
                <div class="places">
                  <div class="s-bar"><span [style.width.%]="e.taken"></span></div>
                  <p>
                    {{
                      e.full
                        ? 'Complet'
                        : e.remainingPlaces +
                          ' place' +
                          ((e.remainingPlaces ?? 0) > 1 ? 's' : '') +
                          ' restante' +
                          ((e.remainingPlaces ?? 0) > 1 ? 's' : '')
                    }}
                  </p>
                </div>
              }
              <div class="foot">
                <p class="price">{{ e.priceLabel }}</p>
                @if (!e.full && e.link) {
                  <a class="btn btn-ghost btn-sm" [href]="e.link" target="_blank" rel="noopener"
                    ><lucide-icon [img]="icons.MessageCircle" [size]="16" />Je réserve</a
                  >
                } @else if (e.full) {
                  <span class="tag">Complet</span>
                }
              </div>
            </div>
          </article>
        }
      </div>
    </div>
  `,
  styles: `
    .events {
      display: grid;
      gap: 16px;
    }
    @media (min-width: 900px) {
      .events {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .event {
      display: grid;
      grid-template-columns: 88px 1fr;
      gap: 22px;
      padding: 22px;
    }
    .event:hover {
      transform: translateY(-4px);
      border-color: var(--s-line-2);
    }
    .event.full {
      opacity: 0.65;
    }
    .date {
      display: grid;
      align-content: center;
      justify-items: center;
      height: 104px;
      border-radius: 18px;
      background: var(--s-heat);
      color: #fff;
      box-shadow: 0 14px 34px -14px rgba(255, 70, 40, 0.8);
    }
    .full .date {
      background: var(--s-surface-2);
      box-shadow: none;
      color: var(--s-muted);
    }
    .date strong {
      font-size: 40px;
      font-weight: 840;
      line-height: 1;
      letter-spacing: -0.05em;
    }
    .date span {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
    .body {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      font-size: 13px;
      color: var(--s-muted);
    }
    .meta span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .meta span:first-child::first-letter {
      text-transform: uppercase;
    }
    h3 {
      margin: 8px 0 6px;
      font-size: 24px;
      font-weight: 780;
      letter-spacing: -0.035em;
      line-height: 1.1;
    }
    .desc {
      margin: 0;
      color: var(--s-muted);
      font-size: 15px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .places {
      margin-top: 16px;
    }
    .places p {
      margin: 6px 0 0;
      font-size: 13px;
      color: var(--s-muted);
    }
    .s-bar {
      height: 6px;
      border-radius: 6px;
      background: var(--s-surface-2);
      overflow: hidden;
    }
    .s-bar span {
      display: block;
      height: 100%;
      border-radius: 6px;
      background: var(--s-heat);
    }
    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: auto;
      padding-top: 18px;
    }
    .price {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.04em;
    }
  `,
})
export class SiteEvents {
  readonly data = input.required<SiteData>();
  protected readonly icons = { Clock, MapPin, MessageCircle };

  protected readonly events = computed(() => {
    const { events, club } = this.data();
    return events.map((e) => {
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
        priceLabel: e.price > 0 ? money(e.price, club.currency) : 'Gratuit',
        link: whatsapp(
          club,
          `Bonjour, je souhaite réserver une place pour « ${e.name} » du ${DAY.format(at)} ${MONTH.format(at)}.`,
        ),
      };
    });
  });
}
