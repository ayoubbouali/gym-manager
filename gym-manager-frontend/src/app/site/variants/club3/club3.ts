import { DecimalPipe } from '@angular/common';
import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  LucideAngularModule,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  X,
  Zap,
} from 'lucide-angular';
import { CountUp, Reveal } from '../../motion';
import { SiteView } from '../site-view';

/** Showcase design "fight poster": acid yellow, black, thick borders, hard shadows, tickers. */
@Component({
  selector: 'gm-club3',
  imports: [RouterLink, DecimalPipe, LucideAngularModule, Reveal, CountUp],
  templateUrl: './club3.html',
  styleUrls: ['./club3.scss', './club3-2.scss', './club3-3.scss'],
})
export class Club3Page extends SiteView {
  protected readonly icons = {
    ArrowRight,
    ArrowUpRight,
    Clock,
    MapPin,
    Menu,
    MessageCircle,
    Phone,
    X,
    Zap,
  };

  /** Words scrolling in the ticker tapes: the sports, or generic words while loading. */
  protected readonly tape = computed(() => {
    const names = (this.data()?.sports ?? []).map((s) => s.name);
    return names.length ? names : ['Force', 'Sueur', 'Discipline', 'Mental'];
  });

  /** Section numbers follow the visible sections ("ROUND 01", "ROUND 02"…). */
  protected readonly round = computed(() => {
    const map: Record<string, string> = {};
    this.links().forEach((l, i) => (map[l.id] = String(i + 1).padStart(2, '0')));
    return map;
  });

  protected pad(n: number): string {
    return String(n + 1).padStart(2, '0');
  }
}
