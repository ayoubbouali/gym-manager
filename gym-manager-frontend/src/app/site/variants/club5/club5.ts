import { DecimalPipe } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ArrowUpRight,
  Clock,
  LucideAngularModule,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  X,
} from 'lucide-angular';
import { CountUp, Reveal } from '../../motion';
import { SiteView } from '../site-view';

/** Showcase design "private club": near-black background, champagne gold, serif display titles. */
@Component({
  selector: 'gm-club5',
  imports: [DecimalPipe, RouterLink, LucideAngularModule, Reveal, CountUp],
  templateUrl: './club5.html',
  styleUrls: ['./club5.scss', './club5-2.scss'],
})
export class Club5Page extends SiteView {
  protected readonly icons = { ArrowUpRight, Clock, MapPin, Menu, MessageCircle, Phone, X };
  protected readonly roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
}
