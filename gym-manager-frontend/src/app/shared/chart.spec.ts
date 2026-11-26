import { describe, expect, it } from 'vitest';
import { lineChart, pieChart, share } from './chart';

describe('graphiques', () => {
  const fmt = (v: number) => `${v}`;

  it('courbe : une ligne par série, légende et info-bulle sur tous les points du mois survolé', () => {
    const cfg = lineChart(['nov.', 'déc.'], [{ label: 'Inscriptions', data: [3, 5], color: '#2a78d6' }, { label: 'Départs', data: [1, 0], color: '#eb6834' }], fmt);
    expect(cfg.type).toBe('line');
    expect(cfg.data.datasets.map((d) => d.label)).toEqual(['Inscriptions', 'Départs']);
    expect(cfg.data.datasets[0].borderWidth).toBe(2);
    expect(cfg.options!.plugins!.legend!.display).toBe(true);
    expect(cfg.options!.interaction!.mode).toBe('index');
  });

  it('camembert : parts séparées, légende, part en % dans l’info-bulle', () => {
    const cfg = pieChart(['Électricité', 'Eau'], [750, 250], ['#2a78d6', '#eb6834'], fmt);
    expect(cfg.type).toBe('pie');
    expect(cfg.data.datasets[0].borderWidth).toBe(2);
    expect(cfg.options!.plugins!.legend!.display).toBe(true);
    expect(share(750, 1000)).toBe('75 %');
    expect(share(0, 0)).toBe('—');
  });
});
