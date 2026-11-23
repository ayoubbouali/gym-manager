import { describe, expect, it } from 'vitest';
import { RegionalOptions } from '../../core/models';
import { applyRegional } from './regional';

const regional: RegionalOptions = {
  currencies: [{ code: 'EUR', label: 'euro', symbol: '€' }, { code: 'MAD', label: 'dirham marocain', symbol: 'MAD' }],
  countries: [
    { code: 'FR', label: 'France', dialCode: '33', currencyCode: 'EUR', timezone: 'Europe/Paris', example: '06 12 34 56 78', primary: true },
    { code: 'MA', label: 'Maroc', dialCode: '212', currencyCode: 'MAD', timezone: 'Africa/Casablanca', example: '06 50 12 34 56', primary: true },
    { code: 'ZZ', label: 'Pays sans devise', dialCode: '999', currencyCode: null, timezone: 'UTC', example: '', primary: false },
  ],
};
const saved = { 'regional.country': 'MA', 'regional.city': 'Casablanca', 'regional.currencyCode': 'MAD', 'regional.currency': 'DH' };
const start = () => ({ ...saved });

describe('onglet Régional : pré-remplissage', () => {
  it('un nouveau pays vide la ville et renseigne la devise du pays, donc le symbole', () => {
    const v = start();
    applyRegional(v, 'regional.country', 'FR', regional, saved);
    expect(v['regional.city']).toBe('');
    expect(v['regional.currencyCode']).toBe('EUR');
    expect(v['regional.currency']).toBe('€');
  });

  it('le même pays garde la ville', () => {
    const v = start();
    applyRegional(v, 'regional.country', 'MA', regional, saved);
    expect(v['regional.city']).toBe('Casablanca');
  });

  it('un pays sans devise connue garde la devise', () => {
    const v = start();
    applyRegional(v, 'regional.country', 'ZZ', regional, saved);
    expect(v['regional.city']).toBe('');
    expect(v['regional.currencyCode']).toBe('MAD');
    expect(v['regional.currency']).toBe('DH');
  });

  it('la devise renseigne le symbole ; revenir à la devise enregistrée rend le symbole enregistré', () => {
    const v = start();
    applyRegional(v, 'regional.currencyCode', 'EUR', regional, saved);
    expect(v['regional.currency']).toBe('€');
    applyRegional(v, 'regional.currencyCode', 'MAD', regional, saved);
    expect(v['regional.currency']).toBe('DH');
    expect(v['regional.country']).toBe('MA');
  });
});
