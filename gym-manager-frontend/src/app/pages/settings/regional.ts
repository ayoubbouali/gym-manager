import { RegionalOptions } from '../../core/models';

/** Sets a regional value; a chosen time zone also fills in its dial code, a chosen currency its symbol. Nothing is saved. */
export function applyRegional(values: Record<string, string>, key: string, value: string, regional: RegionalOptions | undefined): void {
  values[key] = value;
  if (key === 'regional.timezone') {
    const dialCode = regional?.timezones.find((z) => z.id === value)?.dialCode;
    if (dialCode) values['regional.dialCode'] = dialCode;
  }
  if (key === 'regional.currencyCode') {
    const symbol = regional?.currencies.find((c) => c.code === value)?.symbol;
    if (symbol) values['regional.currency'] = symbol;
  }
}
