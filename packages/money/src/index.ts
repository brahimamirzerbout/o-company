// =============================================================================
// o.company · money
// =============================================================================
// All money is integer cents internally. Conversions happen at the edge.
// FX rates come from a pluggable provider (exchangerate.host by default, with
// crypto via CoinGecko). Cache for 1 hour to stay under free-tier limits.

import { type Currency } from "@o/types";

/** Number of decimal digits for a currency. */
export function decimalsFor(currency: Currency): number {
  // Most are 2. JPY, KRW, IDR, VND, CLP, etc. are 0.
  const zero = new Set([
    "JPY", "KRW", "IDR", "VND", "CLP", "PYG",
  ]);
  return zero.has(currency) ? 0 : 2;
}

/** Convert cents (integer) to a major-unit decimal. */
export function fromCents(cents: number, currency: Currency): number {
  const d = decimalsFor(currency);
  return cents / Math.pow(10, d);
}

/** Convert a major-unit decimal to integer cents. */
export function toCents(amount: number, currency: Currency): number {
  const d = decimalsFor(currency);
  return Math.round(amount * Math.pow(10, d));
}

/** Format integer cents as a localized currency string. */
export function formatMoney(
  cents: number,
  currency: Currency = "USD",
  locale: string = "en-US",
): string {
  const major = fromCents(cents, currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: decimalsFor(currency),
  }).format(major);
}

/** Format compact: $1.2K, €3.4M, ₹56K. */
export function formatMoneyCompact(
  cents: number,
  currency: Currency = "USD",
  locale: string = "en-US",
): string {
  const major = fromCents(cents, currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(major);
}

/** Currency symbol only (best-effort — Intl gives the right one for the locale). */
export function currencySymbol(currency: Currency, locale: string = "en-US"): string {
  return (0)
    .toLocaleString(locale, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .replace(/\d/g, "")
    .trim();
}

// =============================================================================
// FX
// =============================================================================

/** A snapshot of exchange rates against a base currency. */
export interface FxRates {
  base: Currency;
  rates: Record<Currency, number>;
  /** When these rates were fetched. */
  fetchedAt: string;
  /** Source for audit. */
  source: "exchangerate.host" | "frankfurter" | "manual";
}

export interface FxProvider {
  name: FxRates["source"];
  /** Fetch the latest rates against a base currency. */
  fetch(base: Currency): Promise<FxRates>;
}

/** Default provider — exchangerate.host. Free, no key required for basic use. */
export class ExchangerateHostProvider implements FxProvider {
  name = "exchangerate.host" as const;
  async fetch(base: Currency): Promise<FxRates> {
    const url = `https://api.exchangerate.host/latest?base=${base}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
    const data = await res.json() as { rates: Record<string, number> };
    return {
      base,
      rates: data.rates as Record<Currency, number>,
      fetchedAt: new Date().toISOString(),
      source: this.name,
    };
  }
}

/** Fallback provider — Frankfurter (ECB rates, no auth, reliable). */
export class FrankfurterProvider implements FxProvider {
  name = "frankfurter" as const;
  async fetch(base: Currency): Promise<FxRates> {
    const url = `https://api.frankfurter.app/latest?from=${base}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
    const data = await res.json() as { rates: Record<string, number> };
    return {
      base,
      rates: data.rates as Record<Currency, number>,
      fetchedAt: new Date().toISOString(),
      source: this.name,
    };
  }
}

/** In-memory cache with TTL. Singleton in the process. */
class FxCache {
  private cache = new Map<Currency, { value: FxRates; expiresAt: number }>();

  get(base: Currency, ttlMs: number = 60 * 60 * 1000): FxRates | null {
    const hit = this.cache.get(base);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.cache.delete(base);
      return null;
    }
    return hit.value;
  }

  set(rates: FxRates, ttlMs: number = 60 * 60 * 1000) {
    this.cache.set(rates.base, { value: rates, expiresAt: Date.now() + ttlMs });
  }
}

const fxCache = new FxCache();

/** Get FX rates against `base`. Cached for 1 hour by default. */
export async function getFxRates(
  base: Currency = "USD",
  provider: FxProvider = new ExchangerateHostProvider(),
  ttlMs: number = 60 * 60 * 1000,
): Promise<FxRates> {
  const cached = fxCache.get(base, ttlMs);
  if (cached) return cached;
  const fresh = await provider.fetch(base);
  fxCache.set(fresh, ttlMs);
  return fresh;
}

/** Convert cents from one currency to another using the latest rates. */
export async function convertCents(
  cents: number,
  from: Currency,
  to: Currency,
  base: Currency = "USD",
): Promise<number> {
  if (from === to) return cents;
  const rates = await getFxRates(base);
  // Convert: from → base → to
  const fromToBase = base === from ? 1 : 1 / (rates.rates[from] ?? 1);
  const baseToTo = base === to ? 1 : rates.rates[to] ?? 1;
  const fromMajor = fromCents(cents, from);
  const baseMajor = fromMajor * fromToBase;
  const toMajor = baseMajor * baseToTo;
  return toCents(toMajor, to);
}
