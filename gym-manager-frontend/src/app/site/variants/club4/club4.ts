import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock,
  Dumbbell,
  LucideAngularModule,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  RotateCw,
  Sparkles,
  Ticket,
  Users,
  X,
} from 'lucide-angular';
import { CountUp, Reveal } from '../../motion';
import { SiteView } from '../site-view';

/** Showcase design "light bento / modern app": soft cards, pastel tints, pill controls. */
@Component({
  selector: 'gm-club4',
  imports: [RouterLink, LucideAngularModule, Reveal, CountUp],
  templateUrl: './club4.html',
  styleUrls: ['./club4.scss', './club4-2.scss'],
})
export class Club4Page extends SiteView {
  protected readonly icons = {
    ArrowRight,
    ArrowUpRight,
    CalendarDays,
    Clock,
    Dumbbell,
    MapPin,
    Menu,
    MessageCircle,
    Phone,
    RotateCw,
    Sparkles,
    Ticket,
    Users,
    X,
  };
  protected readonly dayIndexes = [1, 2, 3, 4, 5, 6, 7];
  protected readonly dayLetters = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  /** Bento tile size cycles so the disciplines grid never looks uniform. */
  protected tileSize(i: number, count: number): string {
    if (count === 1) return 'xl';
    const pattern = ['xl', 'md', 'md', 'wide', 'md', 'md'];
    return pattern[i % pattern.length];
  }

  /** Elapsed share (0-100) of a session running now. */
  protected progress(start: string, duration: number): number {
    const [h, m] = start.split(':').map(Number);
    const elapsed = this.clock().min - (h * 60 + m);
    return Math.max(0, Math.min(100, (elapsed / Math.max(1, duration)) * 100));
  }

  protected readonly round = Math.round;
  protected readonly liveCount = computed(() => this.daySessions().filter((s) => s.live).length);
}
