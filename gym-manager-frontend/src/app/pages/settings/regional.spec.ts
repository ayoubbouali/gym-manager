import { describe, expect, it } from 'vitest';
import { RegionalOptions } from '../../core/models';
import { applyRegional } from './regional';

const regional: RegionalOptions = {
  currencies: [{ code: 'EUR', label: 'euro', symbol: '€' }, { code: 'MAD', label: 'dirham marocain', symbol: 'MAD' }],
  timezones: [{ id: 'Europe/Paris', dialCode: '33' }, { id: 'America/Toronto', dialCode: '1' }, { id: 'UTC', dialCode: null }],
  dialCodes: [{ code: '33', label: 'France' }, { code: '212', label: 'Maroc' }, { code: '1', label: 'États-Unis' }],
};
const start = () => ({ 'regional.timezone': 'Africa/Casablanca', 'regional.dialCode': '212', 'regional.currencyCode': 'MAD', 'regional.currency': 'DH' });

describe('onglet Régional : pré-remplissage', () => {
  it('le fuseau renseigne l’indicatif', () => {
    const v = start();
    applyRegional(v, 'regional.timezone', 'Europe/Paris', regional);
    expect(v['regional.dialCode']).toBe('33');
    applyRegional(v, 'regional.timezone', 'America/Toronto', regional);
    expect(v['regional.dialCode']).toBe('1');
  });

  it('un fuseau sans pays laisse l’indicatif inchangé', () => {
    const v = start();
    applyRegional(v, 'regional.timezone', 'UTC', regional);
    expect(v['regional.timezone']).toBe('UTC');
    expect(v['regional.dialCode']).toBe('212');
  });

  it('la devise renseigne le symbole, qui reste modifiable', () => {
    const v = start();
    applyRegional(v, 'regional.currencyCode', 'EUR', regional);
    expect(v['regional.currency']).toBe('€');
    applyRegional(v, 'regional.dialCode', '212', regional);
    expect(v['regional.currency']).toBe('€');
    expect(v['regional.timezone']).toBe('Africa/Casablanca');
  });
});
