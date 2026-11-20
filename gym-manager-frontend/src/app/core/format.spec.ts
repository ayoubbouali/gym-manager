import { describe, expect, it } from 'vitest';
import { formatAmount, formatDate, formatDateTime, formatMonth, norm } from './format';
import { initials } from './config.service';

describe('formats français', () => {
  it('montants au format 1 234,50', () => {
    expect(formatAmount(1234.5)).toBe('1 234,50');
    expect(formatAmount(3213)).toBe('3 213,00');
    expect(formatAmount(21577, 0)).toBe('21 577');
    expect(formatAmount(null)).toBe('—');
  });

  it('dates jj/mm/aaaa et jj/mm/aaaa HH:mm', () => {
    expect(formatDate('2026-07-22')).toBe('22/07/2026');
    expect(formatDateTime('2026-09-12T18:00:00')).toBe('12/09/2026 18:00');
    expect(formatDate(null)).toBe('—');
    expect(formatMonth('2026-05', true)).toBe('mai 2026');
  });

  it('recherche insensible à la casse et aux accents', () => {
    expect(norm('  Aérobic ')).toBe('aerobic');
    expect(norm('ÉTÉ')).toBe('ete');
  });

  it('initiales du club', () => {
    expect(initials('Club Gym Manager')).toBe('GM');
    expect(initials('Gym')).toBe('G');
  });
});
