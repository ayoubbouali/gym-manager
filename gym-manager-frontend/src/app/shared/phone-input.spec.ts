import { Component, importProvidersFrom, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../core/config.service';
import { APP_ICONS } from '../core/icons';
import { PhoneCountry } from '../core/models';
import { PhoneInput, PhoneValue, filterCountries, phoneCountryOf } from './phone-input';

const COUNTRIES: PhoneCountry[] = [
  { code: 'CA', label: 'Canada', dialCode: '1', example: '506 234 5678', primary: false },
  { code: 'US', label: 'États-Unis', dialCode: '1', example: '(201) 555-0123', primary: true },
  { code: 'FR', label: 'France', dialCode: '33', example: '06 12 34 56 78', primary: true },
  { code: 'MA', label: 'Maroc', dialCode: '212', example: '06 50 12 34 56', primary: true },
];

describe('téléphone : pays d’un numéro enregistré', () => {
  it('un numéro national s’ouvre sur le pays du club', () => {
    expect(phoneCountryOf('0612345678', 'MA', COUNTRIES)).toBe('MA');
    expect(phoneCountryOf('', 'FR', COUNTRIES)).toBe('FR');
  });

  it('un numéro « + » s’ouvre sur le pays de son indicatif, le pays principal pour un indicatif partagé', () => {
    expect(phoneCountryOf('+33612345678', 'MA', COUNTRIES)).toBe('FR');
    expect(phoneCountryOf('+14155552671', 'MA', COUNTRIES)).toBe('US');
    expect(phoneCountryOf('+14155552671', 'CA', COUNTRIES)).toBe('CA');
    expect(phoneCountryOf('+999', 'MA', COUNTRIES)).toBe('MA');
  });

  it('filtre par nom (sans accents) ou par indicatif', () => {
    expect(filterCountries(COUNTRIES, 'maroc').map((c) => c.code)).toEqual(['MA']);
    expect(filterCountries(COUNTRIES, 'etats').map((c) => c.code)).toEqual(['US']);
    expect(filterCountries(COUNTRIES, '+212').map((c) => c.code)).toEqual(['MA']);
    expect(filterCountries(COUNTRIES, '1').map((c) => c.code)).toEqual(['CA', 'US']);
    expect(filterCountries(COUNTRIES, '')).toHaveLength(4);
  });
});

@Component({
  imports: [ReactiveFormsModule, PhoneInput],
  template: `<app-phone-input label="Téléphone" [formControl]="ctrl" required />`,
})
class Host {
  ctrl = new FormControl<PhoneValue>({ country: null, number: '' }, { nonNullable: true });
}

describe('champ téléphone', () => {
  let f: ComponentFixture<Host>;
  const el = () => f.nativeElement as HTMLElement;
  const numberInput = () => el().querySelector('input[type="tel"]') as HTMLInputElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: ConfigService, useValue: { country: signal('MA'), phoneCountries: signal(COUNTRIES), loadPhoneCountries: vi.fn() } },
      ],
    });
    f = TestBed.createComponent(Host);
    f.detectChanges();
    await f.whenStable();
  });

  it('s’ouvre sur le pays du club, placeholder = exemple du pays', () => {
    expect(el().querySelector('.phone-country .fi-ma')).not.toBeNull();
    expect(el().querySelector('.phone-country')!.textContent).toContain('+212');
    expect(numberInput().placeholder).toBe('06 50 12 34 56');
  });

  it('un clic sur le drapeau ouvre une liste filtrable ; le pays choisi change le placeholder et la valeur', async () => {
    (el().querySelector('.phone-country') as HTMLButtonElement).click();
    f.detectChanges();
    await f.whenStable();
    const search = document.querySelector('.phone-country-search input') as HTMLInputElement;
    expect(search).not.toBeNull();
    expect(document.querySelectorAll('.phone-country-menu [mat-menu-item]').length).toBe(4);
    search.value = 'fran';
    search.dispatchEvent(new Event('input'));
    f.detectChanges();
    const items = document.querySelectorAll('.phone-country-menu [mat-menu-item]');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('+33');
    (items[0] as HTMLButtonElement).click();
    f.detectChanges();
    expect(numberInput().placeholder).toBe('06 12 34 56 78');
    expect(f.componentInstance.ctrl.value).toEqual({ country: 'FR', number: '' });

    numberInput().value = '06 12 34 56 78';
    numberInput().dispatchEvent(new Event('input'));
    expect(f.componentInstance.ctrl.value).toEqual({ country: 'FR', number: '06 12 34 56 78' });
  });

  it('un numéro « +33 » enregistré s’ouvre sur la France', () => {
    f.componentInstance.ctrl.setValue({ country: null, number: '+33612345678' });
    f.detectChanges();
    expect(el().querySelector('.phone-country .fi-fr')).not.toBeNull();
    expect(numberInput().value).toBe('+33612345678');
  });

  it('obligatoire : invalide tant que le numéro est vide', () => {
    expect(f.componentInstance.ctrl.hasError('required')).toBe(true);
    numberInput().value = '0612345678';
    numberInput().dispatchEvent(new Event('input'));
    expect(f.componentInstance.ctrl.valid).toBe(true);
    expect(f.componentInstance.ctrl.value).toEqual({ country: 'MA', number: '0612345678' });
  });
});
