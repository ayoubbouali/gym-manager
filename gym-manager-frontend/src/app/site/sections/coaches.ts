import { Component, computed, input } from '@angular/core';
import { Reveal } from '../motion';
import { SiteData, coachPhotoUrl } from '../site-data';

@Component({
  selector: 'gm-site-coaches',
  imports: [Reveal],
  host: { class: 'section' },
  template: `
    <div class="wrap">
      <div class="section-head">
        <div reveal>
          <p class="kicker">L'équipe</p>
          <h2 class="section-title">Des coachs <em>qui te poussent.</em></h2>
        </div>
        <p class="section-lead" [reveal]="120">
          Une équipe qui te connaît, corrige ta technique et t'aide à tenir tes objectifs, séance
          après séance.
        </p>
      </div>

      <div class="team">
        @for (c of coaches(); track c.id; let i = $index) {
          <article
            class="s-card coach"
            [style.--c]="c.color"
            [style.--c2]="c.color2"
            [reveal]="(i % 4) * 80"
          >
            <div class="s-avatar" aria-hidden="true">
              @if (c.photo) {
                <img [src]="c.photo" alt="" loading="lazy" />
              } @else {
                <span>{{ c.initials }}</span>
              }
            </div>
            <h3>{{ c.name }}</h3>
            <p class="role">{{ c.role }}</p>
            <div class="sports">
              @for (s of c.sports; track s.name) {
                <span class="tag" [style.--c]="s.color"><i></i>{{ s.name }}</span>
              }
            </div>
          </article>
        }
      </div>
    </div>
  `,
  styles: `
    .team {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    }
    .coach {
      padding: 26px 22px 24px;
      text-align: center;
      overflow: hidden;
    }
    .coach:hover {
      transform: translateY(-6px) rotate(-0.4deg);
      border-color: var(--s-line-2);
    }
    .s-avatar {
      position: relative;
      width: 112px;
      height: 112px;
      margin: 4px auto 20px;
      border-radius: 50%;
      padding: 3px;
      background: conic-gradient(from 210deg, var(--c), var(--c2), var(--c));
      transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .coach:hover .s-avatar {
      transform: rotate(14deg) scale(1.04);
    }
    .s-avatar img {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      background: #0b0b0f;
    }
    .s-avatar span {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 25%, #23232b, #0b0b0f 70%);
      font-size: 36px;
      font-weight: 820;
      letter-spacing: -0.04em;
    }
    .coach:hover .s-avatar span {
      transform: rotate(-14deg);
      transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    h3 {
      margin: 0;
      font-size: 21px;
      font-weight: 760;
      letter-spacing: -0.03em;
    }
    .role {
      margin: 2px 0 16px;
      color: var(--s-muted);
      font-size: 14px;
    }
    .sports {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 6px;
    }
    .tag i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--c);
    }
  `,
})
export class SiteCoaches {
  readonly data = input.required<SiteData>();

  protected readonly coaches = computed(() => {
    const { coaches, sports } = this.data();
    const color = new Map(sports.map((s) => [s.name, s.color]));
    return coaches.map((c) => {
      const tags = c.sports.map((name) => ({ name, color: color.get(name) ?? '#ff3b2f' }));
      return {
        ...c,
        photo: coachPhotoUrl(c),
        sports: tags,
        color: tags[0]?.color ?? '#ff3b2f',
        color2: tags[1]?.color ?? '#ff8a1f',
      };
    });
  });
}
