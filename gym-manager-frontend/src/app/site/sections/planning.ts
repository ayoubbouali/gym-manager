import { Component, computed, input, signal } from '@angular/core';
import { Reveal } from '../motion';
import { DAYS, DAYS_SHORT, Session, SiteSport, hhmm, isLive, sessions } from '../site-data';

interface Block extends Session {
  lane: number;
  lanes: number;
  live: boolean;
  ambient: boolean;
}

const HOUR = 60;
/** A session this long is open access (e.g. a weight room open all day): drawn as a band behind the classes. */
const AMBIENT = 4 * HOUR;

/** Side-by-side lanes for the sessions of one day that overlap; open-access spans go underneath. */
function layout(day: Session[], at: { day: number; min: number }): Block[] {
  const ambient: Block[] = day
    .filter((s) => s.end - s.start >= AMBIENT)
    .map((s) => ({ ...s, lane: 0, lanes: 1, live: isLive(s, at), ambient: true }));
  const blocks: Block[] = [...ambient];
  let cluster: Block[] = [];
  let clusterEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((b) => b.lane + 1));
    cluster.forEach((b) => (b.lanes = lanes));
    cluster = [];
  };
  for (const s of day.filter((x) => x.end - x.start < AMBIENT)) {
    if (s.start >= clusterEnd) close();
    const used = new Set(cluster.filter((b) => b.end > s.start).map((b) => b.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const b: Block = { ...s, lane, lanes: 1, live: isLive(s, at), ambient: false };
    cluster.push(b);
    blocks.push(b);
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  close();
  return blocks;
}

@Component({
  selector: 'gm-site-planning',
  imports: [Reveal],
  host: { class: 'section' },
  template: `
    <div class="wrap">
      <div class="section-head">
        <div reveal>
          <p class="kicker">Planning</p>
          <h2 class="section-title">Ta semaine, <em>en un coup d'œil.</em></h2>
        </div>
        <p class="section-lead" [reveal]="120">
          Filtre par discipline, repère la séance en cours et choisis ton créneau.
        </p>
      </div>

      <div class="s-toolbar" reveal>
        <div class="s-filters" role="group" aria-label="Filtrer par discipline">
          <button
            type="button"
            class="s-chip"
            [class.on]="!picked().size"
            (click)="picked.set(none)"
          >
            Tout
          </button>
          @for (s of sports(); track s.id) {
            <button
              type="button"
              class="s-chip"
              [class.on]="picked().has(s.id)"
              [attr.aria-pressed]="picked().has(s.id)"
              [style.--c]="s.color"
              (click)="toggle(s.id)"
            >
              <span class="sw"></span>{{ s.name }}
            </button>
          }
        </div>
        <div class="segmented views" role="group" aria-label="Affichage">
          <button type="button" [class.on]="view() === 'week'" (click)="view.set('week')">
            Semaine
          </button>
          <button type="button" [class.on]="view() === 'day'" (click)="view.set('day')">
            Jour
          </button>
        </div>
      </div>

      <div
        class="days-bar"
        [class.s-only-mobile]="view() === 'week'"
        role="tablist"
        aria-label="Jour"
      >
        @for (d of daysShort; track $index) {
          <button
            type="button"
            role="tab"
            [class.on]="day() === $index + 1"
            [class.today]="clock().day === $index + 1"
            [attr.aria-selected]="day() === $index + 1"
            (click)="chosenDay.set($index + 1)"
          >
            {{ d }}<i>{{ count()[$index] }}</i>
          </button>
        }
      </div>

      @if (view() === 'week') {
        <div class="week card" reveal [style.--rows]="range().hours">
          <div class="gutter">
            @for (h of range().ticks; track h) {
              <span>{{ hhmm(h) }}</span>
            }
          </div>
          @for (col of week(); track $index) {
            <div class="col" [class.today]="clock().day === $index + 1">
              <p class="col-head">{{ daysShort[$index] }}</p>
              <div class="col-body">
                @for (b of col; track $index) {
                  <div
                    class="block"
                    [class.live]="b.live"
                    [class.ambient]="b.ambient"
                    [style.--c]="b.sport.color"
                    [style.top.%]="pct(b.start)"
                    [style.height.%]="pct(b.end) - pct(b.start)"
                    [style.left.%]="(b.lane / b.lanes) * 100"
                    [style.width.%]="100 / b.lanes"
                    [attr.title]="b.sport.name + ' · ' + hhmm(b.start) + ' – ' + hhmm(b.end)"
                  >
                    <strong>{{ b.sport.name }}</strong>
                    <span
                      >{{ b.ambient ? 'Accès libre · ' : '' }}{{ hhmm(b.start) }} –
                      {{ hhmm(b.end) }}</span
                    >
                  </div>
                }
                @if (
                  clock().day === $index + 1 &&
                  clock().min >= range().start &&
                  clock().min <= range().end
                ) {
                  <span class="now" [style.top.%]="pct(clock().min)"></span>
                }
              </div>
            </div>
          }
        </div>
      }

      <ul class="list" [class.s-only-mobile]="view() === 'week'">
        @for (s of dayList(); track $index) {
          <li class="row card" [class.live]="isLive(s, clock())" [style.--c]="s.sport.color">
            <div class="time">
              <strong>{{ hhmm(s.start) }}</strong><span>{{ hhmm(s.end) }}</span>
            </div>
            <div class="what">
              <strong>{{ s.sport.name }}</strong>
              @if (s.sport.coaches.length) {
                <span>avec {{ s.sport.coaches.join(', ') }}</span>
              }
            </div>
            @if (isLive(s, clock())) {
              <span class="tag live">En cours</span>
            } @else {
              <span class="dur">{{ duration(s.end - s.start) }}</span>
            }
          </li>
        } @empty {
          <li class="empty">
            Pas de séance le {{ days[day() - 1].toLowerCase()
            }}{{ picked().size ? ' pour cette sélection' : '' }}.
          </li>
        }
      </ul>
    </div>
  `,
  styleUrl: './planning.scss',
})
export class SitePlanning {
  readonly sports = input.required<SiteSport[]>();
  readonly clock = input.required<{ day: number; min: number }>();

  protected readonly days = DAYS;
  protected readonly daysShort = DAYS_SHORT;
  protected readonly hhmm = hhmm;
  protected readonly isLive = isLive;
  protected readonly none = new Set<number>();
  protected readonly picked = signal(new Set<number>());
  protected readonly view = signal<'week' | 'day'>('week');
  protected readonly chosenDay = signal<number | null>(null);
  /** The selected day: today until the visitor picks one. */
  protected readonly day = computed(() => this.chosenDay() ?? this.clock().day);

  private readonly all = computed(() => sessions(this.sports()));
  private readonly shown = computed(() => {
    const p = this.picked();
    return p.size ? this.all().filter((s) => p.has(s.sport.id)) : this.all();
  });

  protected readonly range = computed(() => {
    const all = this.all();
    const start = all.length
      ? Math.floor(Math.min(...all.map((s) => s.start)) / HOUR) * HOUR
      : 8 * HOUR;
    const end = all.length
      ? Math.ceil(Math.max(...all.map((s) => s.end)) / HOUR) * HOUR
      : 20 * HOUR;
    const ticks: number[] = [];
    for (let t = start; t < end; t += HOUR) ticks.push(t);
    return { start, end, hours: (end - start) / HOUR, ticks };
  });
  protected readonly week = computed(() =>
    [1, 2, 3, 4, 5, 6, 7].map((d) =>
      layout(
        this.shown().filter((s) => s.day === d),
        this.clock(),
      ),
    ),
  );
  protected readonly count = computed(() =>
    [1, 2, 3, 4, 5, 6, 7].map((d) => this.shown().filter((s) => s.day === d).length),
  );
  protected readonly dayList = computed(() => this.shown().filter((s) => s.day === this.day()));

  protected duration(min: number): string {
    if (min < 120) return `${min} min`;
    const h = Math.floor(min / 60);
    return min % 60 ? `${h} h ${String(min % 60).padStart(2, '0')}` : `${h} h`;
  }

  protected pct(min: number): number {
    const r = this.range();
    return ((min - r.start) / (r.end - r.start)) * 100;
  }

  protected toggle(id: number): void {
    const next = new Set(this.picked());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.picked.set(next);
  }
}
