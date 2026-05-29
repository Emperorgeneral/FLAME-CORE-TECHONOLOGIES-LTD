import type { CurrencyCode, PaymentProvider } from '../types/index.js';

/**
 * Payment provider abstraction.
 *
 * Every provider (Stripe, Paystack, Flutterwave, PayPal, crypto…) implements
 * this interface. Adding a new provider == drop in a new class. No callers
 * need to change. Keep all provider-specific logic behind this boundary.
 */

export interface ChargeRequest {
  team_id: string;
  invoice_id: string;
  /** Amount in MINOR units of the target currency (kobo, cents, pence). */
  amount_minor: number;
  currency: CurrencyCode;
  customer_email: string;
  customer_name?: string;
  /** Provider-specific token/identifier (card token, mobile money number, etc.). */
  source_token?: string;
  /** URL to redirect customer back to after off-site payment. */
  return_url?: string;
  /** Extra context shown on the provider receipt / dashboard. */
  description?: string;
  metadata?: Record<string, string>;
}

export interface ChargeResult {
  success: boolean;
  /** Provider-assigned transaction reference. */
  provider_ref: string | null;
  /** When the payment requires off-site interaction (3DS, OTP, redirect…). */
  redirect_url?: string;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  /** Provider fee in MINOR units of the same currency. */
  fee_minor?: number;
  error?: string;
  raw?: unknown;
}

export interface RefundRequest {
  provider_ref: string;
  /** Optional partial refund amount in MINOR units. */
  amount_minor?: number;
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  refund_ref: string | null;
  error?: string;
}

export interface WebhookVerification {
  valid: boolean;
  event_type: string;
  provider_ref: string | null;
  status: 'paid' | 'failed' | 'refunded' | 'disputed' | 'other';
  amount_minor: number | null;
  currency: CurrencyCode | null;
  raw: unknown;
}

export interface PaymentProviderAdapter {
  name: PaymentProvider;
  /** Currencies this provider can charge in our markets. */
  supportedCurrencies: CurrencyCode[];

  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(req: RefundRequest): Promise<RefundResult>;
  /** Verify webhook signature + parse event. */
  verifyWebhook(rawBody: string, signature: string): Promise<WebhookVerification>;
}
