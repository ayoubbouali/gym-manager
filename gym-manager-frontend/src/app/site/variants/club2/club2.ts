import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowUpRight, LucideAngularModule, Menu, MessageCircle, X } from 'lucide-angular';
import { Reveal } from '../../motion';
import { SiteView } from '../site-view';

const ISSUE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Showcase design "editorial / magazine": paper background, serif headlines, hairline rules. */
@Component({
  selector: 'gm-club2',
  imports: [RouterLink, LucideAngularModule, Reveal],
  templateUrl: './club2.html',
  styleUrl: './club2.scss',
})
export class Club2Page extends SiteView {
  protected readonly icons = { ArrowUpRight, Menu, MessageCircle, X };
  protected readonly issue = ISSUE.format(new Date());

  /** Section numbers follow the visible sections, so hiding one never leaves a gap ("01, 02, 04"). */
  protected readonly num = computed(() => {
    const map: Record<string, string> = {};
    this.links().forEach((l, i) => (map[l.id] = String(i + 1).padStart(2, '0')));
    return map;
  });
}
