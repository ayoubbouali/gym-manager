import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AppConfig, PhoneCountry } from './models';

/** UI configuration coming from the settings (club, currency, thresholds…). */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private api = inject(ApiService);
  readonly config = signal<AppConfig | null>(null);
  readonly publicName = signal('Gym Manager');
  /** Countries of the phone fields, loaded once. */
  readonly phoneCountries = signal<PhoneCountry[]>([]);
  private phoneCountriesLoad: Promise<void> | null = null;

  readonly currency = computed(() => this.config()?.currency ?? 'DH');
  readonly phoneExample = computed(() => this.config()?.phoneExample ?? '');
  readonly country = computed(() => this.config()?.country ?? 'MA');
  readonly clubName = computed(() => this.config()?.clubName ?? this.publicName());
  readonly pageSize = computed(() => this.config()?.pageSize ?? 10);
  /** Uploaded logo (Paramètres › Club), if any. */
  readonly customLogoUrl = computed(() => {
    const v = this.config()?.logoVersion;
    return v ? `/api/club/logo?v=${encodeURIComponent(v)}` : null;
  });
  /** Full logo: uploaded one, otherwise the club's default logo shipped with the app. */
  readonly logoUrl = computed(() => this.customLogoUrl() ?? '/brand/logo.png');
  /** Square emblem for the menu: uploaded logo, otherwise the default "A" emblem. */
  readonly markUrl = computed(() => this.customLogoUrl() ?? '/brand/mark.png');
  readonly initials = computed(() => initials(this.clubName()));

  async load(): Promise<void> {
    this.config.set(await this.api.get<AppConfig>('/config'));
  }

  /** Loads the phone countries on first use; a failure leaves the list empty and is retried next time. */
  loadPhoneCountries(): Promise<void> {
    this.phoneCountriesLoad ??= this.api.get<PhoneCountry[]>('/regional/countries').then(
      (list) => this.phoneCountries.set(list),
      () => {
        this.phoneCountriesLoad = null;
      },
    );
    return this.phoneCountriesLoad;
  }

  async loadPublic(): Promise<void> {
    try {
      const r = await this.api.get<{ name: string }>('/public/club');
      this.publicName.set(r.name);
    } catch {
      /* keep default */
    }
  }
}

/** "Club Gym Manager" → "GM" (ignores the word "club"). */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !/^club$/i.test(w));
  const letters = (words.length ? words : name.split(/\s+/)).map((w) => w[0]?.toUpperCase() ?? '');
  return letters.slice(0, 2).join('') || 'GM';
}
