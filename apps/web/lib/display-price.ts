import { convertMoney, type FxRates, type Money } from '@medtravel/contracts';

/**
 * A price in the visitor's chosen currency, from rates quoted against the price's own currency. Returns null when the rates do not
 * cover the target, so the caller keeps showing the original price instead of a guess.
 */
export function inCurrency(
  price: Money,
  target: string,
  rates: Pick<FxRates, 'base' | 'rates'> | undefined,
): Money | null {
  if (price.currency === target) return price;
  if (!rates || rates.base !== price.currency) return null;
  const rate = rates.rates[target];
  return rate ? convertMoney(price, target, rate) : null;
}
