import type { PaymentProviderAdapter } from './types.js';
import type { CurrencyCode, PaymentProvider } from '../types/index.js';
import { StripeProvider } from './providers/stripe.js';
import { PaystackProvider } from './providers/paystack.js';
import { FlutterwaveProvider } from './providers/flutterwave.js';
import { PayPalProvider } from './providers/paypal.js';
import { logger } from '../utils/logger.js';

/**
 * Payment provider registry.
 *
 * - Constructs each provider from env vars at boot.
 * - `pickFor(currency, countryCode?)` returns the best provider for the
 *   customer's context. Routing rules below — easy to evolve over time.
 * - Adding a new provider == one new file in /providers + one line here.
 */
class PaymentRegistry {
  private providers = new Map<PaymentProvider, PaymentProviderAdapter>();

  constructor() {
    if (process.env.STRIPE_SECRET_KEY) {
      this.providers.set('stripe', new StripeProvider(
        process.env.STRIPE_SECRET_KEY,
        process.env.STRIPE_WEBHOOK_SECRET ?? '',
      ));
    }
    if (process.env.PAYSTACK_SECRET_KEY) {
      this.providers.set('paystack', new PaystackProvider(process.env.PAYSTACK_SECRET_KEY));
    }
    if (process.env.FLUTTERWAVE_SECRET_KEY) {
      this.providers.set('flutterwave', new FlutterwaveProvider(
        process.env.FLUTTERWAVE_SECRET_KEY,
        process.env.FLUTTERWAVE_SECRET_HASH ?? '',
      ));
    }
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
      this.providers.set('paypal', new PayPalProvider(
        process.env.PAYPAL_CLIENT_ID,
        process.env.PAYPAL_CLIENT_SECRET,
        (process.env.PAYPAL_MODE as 'sandbox' | 'live') ?? 'live',
      ));
    }

    logger.info(`Payments: ${this.providers.size} provider(s) registered: ${[...this.providers.keys()].join(', ') || 'none'}`);
  }

  get(name: PaymentProvider): PaymentProviderAdapter | null {
    return this.providers.get(name) ?? null;
  }

  list(): PaymentProvider[] {
    return [...this.providers.keys()];
  }

  /**
   * Routing logic — return the best provider for the given currency + country.
   *
   * Priority:
   *   1. Africa-issued cards / mobile money → Paystack or Flutterwave (lower fees, local methods).
   *   2. Cards from the US/EU/UK paying in USD/EUR/GBP → Stripe.
   *   3. Anything else / fallback → PayPal.
   *
   * Easy to evolve — e.g. route by lowest fee, by user preference, etc.
   */
  pickFor(currency: CurrencyCode, countryCode?: string | null): PaymentProviderAdapter | null {
    const africa = ['NG', 'GH', 'KE', 'ZA', 'CI', 'EG', 'UG', 'RW', 'TZ', 'CM'];
    const isAfrica = countryCode ? africa.includes(countryCode.toUpperCase()) : false;

    const candidateOrder: PaymentProvider[] = isAfrica
      ? ['paystack', 'flutterwave', 'stripe', 'paypal']
      : ['stripe', 'paystack', 'flutterwave', 'paypal'];

    for (const name of candidateOrder) {
      const adapter = this.providers.get(name);
      if (adapter && adapter.supportedCurrencies.includes(currency)) {
        return adapter;
      }
    }
    return null;
  }

  /** All providers that can charge the given currency. */
  availableForCurrency(currency: CurrencyCode): PaymentProvider[] {
    const out: PaymentProvider[] = [];
    for (const [name, adapter] of this.providers) {
      if (adapter.supportedCurrencies.includes(currency)) out.push(name);
    }
    return out;
  }
}

export const paymentRegistry = new PaymentRegistry();
