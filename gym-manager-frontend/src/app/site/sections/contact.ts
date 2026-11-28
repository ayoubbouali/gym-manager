import { Component, computed, input, signal } from '@angular/core';
import {
  ArrowUpRight,
  ChevronDown,
  Clock,
  LucideAngularModule,
  MapPin,
  MessageCircle,
  Phone,
} from 'lucide-angular';
import { Reveal } from '../motion';
import { DAYS, SiteData, hhmm, maps, openingHours, sessions, tel, whatsapp } from '../site-data';

@Component({
  selector: 'gm-site-contact',
  imports: [LucideAngularModule, Reveal],
  host: { class: 'section' },
  template: `
    <div class="wrap">
      <div class="cta" reveal>
        <div class="cta-bg" aria-hidden="true"></div>
        <p class="kicker">Prêt·e ?</p>
        <h2 class="cta-title">Ta première séance<br />commence <em>ici.</em></h2>
        <p class="cta-lead">
          Passe nous voir ou écris-nous : on te répond vite et on t'aide à choisir la formule qui te
          ressemble.
        </p>
        <div class="cta-actions">
          @if (wa(); as href) {
            <a class="btn btn-light btn-lg" [href]="href" target="_blank" rel="noopener"
              ><lucide-icon [img]="icons.MessageCircle" [size]="20" />Écrire sur WhatsApp</a
            >
          }
          @if (phone(); as href) {
            <a class="btn btn-ghost btn-lg" [href]="href"
              ><lucide-icon [img]="icons.Phone" [size]="18" />{{ data().club.phone }}</a
            >
          }
        </div>
      </div>

      <div class="grid">
        <div class="infos" reveal>
          <p class="kicker">Nous trouver</p>
          <h2 class="section-title">{{ data().club.name }}</h2>
          @if (data().club.address || data().club.city) {
            <a class="info" [href]="map()" target="_blank" rel="noopener">
              <span class="ic"><lucide-icon [img]="icons.MapPin" [size]="18" /></span>
              <span
                ><strong>{{ data().club.address }}</strong
                ><small>{{ data().club.city }}</small></span
              >
              <lucide-icon class="go" [img]="icons.ArrowUpRight" [size]="18" />
            </a>
          }
          @if (phone(); as href) {
            <a class="info" [href]="href">
              <span class="ic"><lucide-icon [img]="icons.Phone" [size]="18" /></span>
              <span
                ><strong>{{ data().club.phone }}</strong
                ><small>Appelle-nous</small></span
              >
              <lucide-icon class="go" [img]="icons.ArrowUpRight" [size]="18" />
            </a>
          }
        </div>

        @if (hasHours()) {
          <div class="s-card hours" [reveal]="100">
            <p class="hours-title">
              <lucide-icon [img]="icons.Clock" [size]="16" />Horaires des cours
            </p>
            <ul>
              @for (h of hours(); track $index) {
                <li [class.today]="clock().day === $index + 1">
                  <span>{{ days[$index] }}</span>
                  <span>{{ h ? hhmm(h.start) + ' – ' + hhmm(h.end) : 'Fermé' }}</span>
                </li>
              }
            </ul>
          </div>
        }
      </div>

      <div class="faq">
        <p class="kicker" reveal>Questions fréquentes</p>
        @for (q of faq(); track q.q; let i = $index) {
          <div class="qa" [class.open]="opened() === i" reveal>
            <button
              type="button"
              [attr.aria-expanded]="opened() === i"
              [attr.aria-controls]="'faq-' + i"
              (click)="opened.set(opened() === i ? -1 : i)"
            >
              {{ q.q }}<lucide-icon [img]="icons.ChevronDown" [size]="20" />
            </button>
            <div class="answer" [id]="'faq-' + i" role="region">
              <p>{{ q.a }}</p>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styleUrl: './contact.scss',
})
export class SiteContact {
  readonly data = input.required<SiteData>();
  readonly clock = input.required<{ day: number; min: number }>();
  protected readonly icons = { ArrowUpRight, ChevronDown, Clock, MapPin, MessageCircle, Phone };
  protected readonly days = DAYS;
  protected readonly hhmm = hhmm;
  protected readonly opened = signal(0);

  protected readonly wa = computed(() =>
    whatsapp(
      this.data().club,
      `Bonjour ${this.data().club.name}, je souhaite venir faire une séance.`,
    ),
  );
  protected readonly phone = computed(() => tel(this.data().club));
  protected readonly map = computed(() => maps(this.data().club));
  protected readonly hours = computed(() => openingHours(sessions(this.data().sports)));
  protected readonly hasHours = computed(() => this.hours().some(Boolean));

  protected readonly faq = computed(() => {
    const d = this.data();
    const top = Math.max(0, ...d.packs.map((p) => p.discountPercent ?? 0));
    const best = d.packs.find((p) => p.discountPercent === top);
    const list = [
      {
        q: 'Comment m’inscrire ?',
        a: "Passe à l'accueil du club ou écris-nous sur WhatsApp : on t'explique les formules, on répond à tes questions et on t'inscrit en quelques minutes.",
      },
      {
        q: 'Je débute, est-ce que c’est pour moi ?',
        a: "Oui. Les coachs adaptent les exercices à ton niveau et t'accompagnent dès la première séance. Le plus dur, c'est de passer la porte.",
      },
    ];
    if (top > 0 && best) {
      list.push({
        q: 'Les abonnements longs sont-ils moins chers ?',
        a: `Oui : en t'engageant sur ${best.duration || best.months + ' mois'}, tu profites de -${Math.round(top)} % sur le prix mensuel.`,
      });
    }
    if (d.events.length) {
      list.push({
        q: 'Comment réserver un événement ?',
        a: "Clique sur « Je réserve » sous l'événement pour nous écrire sur WhatsApp. Les places sont limitées : premier arrivé, premier servi.",
      });
    }
    list.push({
      q: 'Quels sont les horaires ?',
      a: 'Le planning ci-dessus est à jour : il affiche tous les créneaux de la semaine, discipline par discipline.',
    });
    return list;
  });
}
