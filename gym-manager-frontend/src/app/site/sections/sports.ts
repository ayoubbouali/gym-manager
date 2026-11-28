import { Component, computed, input } from '@angular/core';
import { ArrowUpRight, Clock, LucideAngularModule, Users } from 'lucide-angular';
import { Reveal } from '../motion';
import {
  DAYS_SHORT,
  SiteData,
  minutes,
  money,
  nextSession,
  sessionWhen,
  sessions,
  tint,
} from '../site-data';

@Component({
  selector: 'gm-site-sports',
  imports: [LucideAngularModule, Reveal],
  host: { class: 'section' },
  template: `
    <div class="wrap">
      <div class="section-head">
        <div reveal>
          <p class="kicker">Disciplines</p>
          <h2 class="section-title">Trouve <em>ton</em> sport.</h2>
        </div>
        <p class="section-lead" [reveal]="120">
          Du cardio à la force, du combat à la souplesse : chaque discipline a son coach, ses
          créneaux et sa communauté.
        </p>
      </div>

      <div class="bento">
        @for (s of cards(); track s.id; let i = $index) {
          <article
            class="s-card sport"
            [class.wide]="s.wide"
            [style.--c]="s.color"
            [style.--glow]="s.glow"
            [reveal]="(i % 3) * 90"
          >
            <div class="sport-top">
              <span class="num">{{ (i + 1).toString().padStart(2, '0') }}</span>
              @if (s.next) {
                <span class="tag" [class.live]="s.next === 'En ce moment'"
                  ><lucide-icon [img]="icons.Clock" [size]="12" />{{ s.next }}</span
                >
              }
            </div>
            <h3 [class.long]="s.name.length > 9">{{ s.name }}</h3>
            <div class="days" aria-label="Jours de cours">
              @for (d of days; track $index) {
                <span [class.on]="s.days.has($index + 1)">{{ d.charAt(0) }}</span>
              }
            </div>
            <div class="sport-foot">
              <div>
                @if (s.coaches) {
                  <p class="coach">
                    <lucide-icon [img]="icons.Users" [size]="14" />{{ s.coaches }}
                  </p>
                }
                <p class="hours">{{ s.weekly }}</p>
              </div>
              @if (s.monthlyPrice) {
                <p class="price"><small>dès</small>{{ s.price }}<small>/mois</small></p>
              }
            </div>
            <lucide-icon class="arrow" [img]="icons.ArrowUpRight" [size]="22" />
          </article>
        }
      </div>
    </div>
  `,
  styles: `
    .bento {
      display: grid;
      gap: 16px;
      grid-template-columns: 1fr;
      grid-auto-flow: dense;
    }
    @media (min-width: 700px) {
      .bento {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    @media (min-width: 1080px) {
      .bento {
        grid-template-columns: repeat(3, 1fr);
      }
      .sport.wide {
        grid-column: span 2;
      }
    }
    .sport {
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-height: 300px;
      padding: 26px;
      overflow: hidden;
      isolation: isolate;
    }
    .sport::before {
      content: '';
      position: absolute;
      z-index: -1;
      width: 70%;
      aspect-ratio: 1;
      right: -20%;
      top: -30%;
      border-radius: 50%;
      background: var(--glow);
      filter: blur(60px);
      opacity: 0.55;
      transition:
        opacity 0.5s,
        transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .sport:hover {
      transform: translateY(-6px);
      border-color: color-mix(in srgb, var(--c) 55%, transparent);
    }
    .sport:hover::before {
      opacity: 0.95;
      transform: scale(1.25);
    }
    .sport-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .num {
      font-size: 13px;
      font-weight: 700;
      color: var(--s-faint);
      letter-spacing: 0.1em;
    }
    .tag.live {
      color: #062b14;
      background: var(--s-ok);
      border-color: transparent;
    }
    h3 {
      margin: auto 0 0;
      font-size: clamp(36px, 4vw, 52px);
      line-height: 0.95;
      font-weight: 830;
      letter-spacing: -0.05em;
      text-transform: uppercase;
      overflow-wrap: anywhere;
      hyphens: auto;
    }
    h3.long {
      font-size: clamp(28px, 3vw, 36px);
      overflow-wrap: normal;
    }
    .days {
      display: flex;
      gap: 6px;
    }
    .days span {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 9px;
      font-size: 12px;
      font-weight: 700;
      color: var(--s-faint);
      border: 1px solid var(--s-line);
    }
    .days span.on {
      background: var(--c);
      color: #fff;
      border-color: transparent;
      box-shadow: 0 4px 14px -4px var(--c);
    }
    .sport-foot {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      padding-top: 18px;
      border-top: 1px solid var(--s-line);
    }
    .coach {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
    .hours {
      margin: 2px 0 0;
      font-size: 13px;
      color: var(--s-muted);
    }
    .price {
      margin: 0;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.04em;
      white-space: nowrap;
    }
    .price small {
      font-size: 12px;
      font-weight: 500;
      color: var(--s-muted);
      letter-spacing: 0;
      margin: 0 4px;
    }
    .arrow {
      position: absolute;
      right: 24px;
      bottom: 112px;
      color: var(--c);
      opacity: 0;
      transform: translate(-8px, 8px);
      transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .sport:hover .arrow {
      opacity: 1;
      transform: none;
    }
  `,
})
export class SiteSports {
  readonly data = input.required<SiteData>();
  readonly clock = input.required<{ day: number; min: number }>();
  protected readonly icons = { ArrowUpRight, Clock, Users };
  protected readonly days = DAYS_SHORT;

  protected readonly cards = computed(() => {
    const { sports, club } = this.data();
    const at = this.clock();
    // A 3-column bento: widen one card per row of three, alternating sides, so the grid stays full.
    return sports.map((s, i) => {
      const own = sessions([s]);
      const next = nextSession(own, at);
      const hours = s.schedules.reduce((t, x) => t + minutes(x.end) - minutes(x.start), 0) / 60;
      const count = s.schedules.length;
      return {
        ...s,
        wide: sports.length > 2 && i % 4 === 0 && i < sports.length - 1,
        glow: tint(s.color, 0.9),
        next: next ? sessionWhen(next, at) : null,
        days: new Set(s.schedules.map((x) => x.day)),
        coaches: s.coaches.join(' · '),
        weekly: count
          ? `${count} séance${count > 1 ? 's' : ''} · ${+hours.toFixed(1)} h / semaine`
          : 'Planning sur demande',
        price: money(s.monthlyPrice, club.currency),
      };
    });
  });
}
