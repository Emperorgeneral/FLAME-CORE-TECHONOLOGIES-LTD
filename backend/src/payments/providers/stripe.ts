import Stripe from 'stripe';
import type {
  PaymentProviderAdapter, ChargeRequest, ChargeResult,
  RefundRequest, RefundResult, WebhookVerification,
} from '../types.js';
import type { CurrencyCode } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Real Stripe provider (production-ready).
 * Uses official Stripe Node SDK.
 */
export class StripeProvider implements PaymentProviderAdapter {
  name = 'stripe' as const;
  supportedCurrencies: CurrencyCode[] = ['USD', 'GBP', 'EUR', 'ZAR'];

  private stripe: Stripe;

  constructor(secretKey: string, private readonly webhookSecret: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2024-06-20',
      typescript: true,
    });
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    try {
      // Create a PaymentIntent. For cards that require 3DS / redirect, we return the client secret via redirect_url pattern.
      const intent = await this.stripe.paymentIntents.create({
        amount: req.amount_minor,
        currency: req.currency.toLowerCase(),
        receipt_email: req.customer_email,
        description: req.description || `Invoice ${req.invoice_id}`,
        metadata: {
          team_id: req.team_id,
          invoice_id: req.invoice_id,
          ...(req.metadata || {}),
        },
        automatic_payment_methods: { enabled: true },
      });

      return {
        success: true,
        provider_ref: intent.id,
        status: intent.status === 'succeeded' ? 'paid' : 'processing',
        redirect_url: intent.client_secret ? undefined : req.return_url, // client handles confirmation
        raw: { client_secret: intent.client_secret },
      };
    } catch (err: any) {
      logger.error('[stripe] charge failed', { invoice: req.invoice_id, error: err.message });
      return {
        success: false,
        provider_ref: null,
        status: 'failed',
        error: err.message,
      };
    }
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: req.provider_ref,
        amount: req.amount_minor,
        reason: (req.reason as any) || 'requested_by_customer',
      });
      return {
        success: true,
        refund_ref: refund.id,
      };
    } catch (err: any) {
      return { success: false, refund_ref: null, error: err.message };
    }
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<WebhookVerification> {
    try {
      const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);

      let status: WebhookVerification['status'] = 'other';
      let providerRef: string | null = null;
      let amount: number | null = null;
      let currency: CurrencyCode | null = null;

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as Stripe.PaymentIntent;
        status = 'paid';
        providerRef = pi.id;
        amount = pi.amount;
        currency = pi.currency.toUpperCase() as CurrencyCode;
      } else if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object as Stripe.PaymentIntent;
        status = 'failed';
        providerRef = pi.id;
      } else if (event.type === 'charge.refunded') {
        status = 'refunded';
      }

      return {
        valid: true,
        event_type: event.type,
        provider_ref: providerRef,
        status,
        amount_minor: amount,
        currency,
        raw: event,
      };
    } catch (err: any) {
      logger.warn('[stripe] webhook verification failed', { error: err.message });
      return {
        valid: false,
        event_type: 'unknown',
        provider_ref: null,
        status: 'other',
        amount_minor: null,
        currency: null,
        raw: { error: err.message },
      };
    }
  }
}
