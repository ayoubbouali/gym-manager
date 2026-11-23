import { RegionalOptions } from '../../core/models';

/**
 * Sets a regional value; nothing is saved. A new country empties the city (it belonged to the former country) and fills
 * in the country's currency; a currency fills in its symbol, or the saved one when back to the saved currency.
 */
export function applyRegional(values: Record<string, string>, key: string, value: string, regional: RegionalOptions | undefined,
                              saved: Record<string, string> = {}): void {
  const previous = values[key];
  values[key] = value;
  if (key === 'regional.country' && value !== previous) {
    values['regional.city'] = '';
    const currency = regional?.countries.find((c) => c.code === value)?.currencyCode;
    if (currency && regional?.currencies.some((c) => c.code === currency)) applyRegional(values, 'regional.currencyCode', currency, regional, saved);
  }
  if (key === 'regional.currencyCode') {
    const symbol = value === saved['regional.currencyCode'] ? saved['regional.currency'] : regional?.currencies.find((c) => c.code === value)?.symbol;
    if (symbol) values['regional.currency'] = symbol;
  }
}
