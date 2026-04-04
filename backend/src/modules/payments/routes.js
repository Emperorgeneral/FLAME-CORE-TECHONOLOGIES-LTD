import { Router } from "express";
import Stripe from "stripe";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

export const paymentRoutes = Router();

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

paymentRoutes.post("/checkout-session", requireAuth, async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.sub },
      include: { items: { include: { template: true } } }
    });

    if (!order) {
      return res.status(404).json({ status: "NOT_FOUND", message: "Order not found" });
    }

    if (!stripe) {
      return res.status(200).json({
        status: "MOCK",
        message: "Stripe key not configured. Configure STRIPE_SECRET_KEY to enable live checkout.",
        orderId: order.id
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${env.frontendUrl}/dashboard.html?payment=success`,
      cancel_url: `${env.frontendUrl}/products.html`,
      line_items: order.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: order.currency.toLowerCase(),
          unit_amount: item.unitCents,
          product_data: {
            name: item.template.name,
            description: item.template.description
          }
        }
      })),
      metadata: {
        orderId: order.id
      }
    });

    await prisma.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        stripeSessionId: session.id,
        amountCents: order.totalCents,
        status: "PENDING"
      },
      update: {
        stripeSessionId: session.id
      }
    });

    return res.json({ status: "OK", checkoutUrl: session.url });
  } catch (err) {
    return next(err);
  }
});

paymentRoutes.post("/webhook", async (req, res, next) => {
  try {
    if (!stripe || !env.stripeWebhookSecret) {
      return res.status(200).json({ status: "IGNORED" });
    }

      const signature = req.headers["stripe-signature"];
      const event = stripe.webhooks.constructEvent(req.body, signature, env.stripeWebhookSecret);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const orderId = session.metadata?.orderId;

        if (orderId) {
          await prisma.order.update({
            where: { id: orderId },
            data: { status: "PAID" }
          });

          await prisma.payment.updateMany({
            where: { orderId },
            data: { status: "SUCCEEDED" }
          });
        }
      }

    return res.json({ received: true });
  } catch (err) {
    return next(err);
  }
});
