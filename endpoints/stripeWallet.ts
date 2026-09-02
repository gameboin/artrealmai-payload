import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import Stripe from 'stripe'

const PACKS_USD = [5, 15, 40, 100, 500]
const MIN_CUSTOM_USD = 5
const MAX_CUSTOM_USD = 1000
const SITE_GEN_URL = 'https://artrealmai.com/gen.html'
const SITE_ACCOUNT_URL = 'https://artrealmai.com/account.html'

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key)
}

function dollarsToCents(amount: unknown) {
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  if (cents < MIN_CUSTOM_USD * 100 || cents > MAX_CUSTOM_USD * 100) return null
  return cents
}

export const genCheckoutEndpoint: Endpoint = {
  path: '/gen/checkout',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to add funds.' }, { status: 401 })
    }
    const stripe = stripeClient()
    if (!stripe) {
      return Response.json({ message: 'Payments are not connected yet.' }, { status: 503 })
    }

    try {
      await addDataAndFileToRequest(req)
    } catch {
      return Response.json({ message: 'Invalid request body.' }, { status: 400 })
    }

    const body = (req.data || {}) as { amount?: unknown; returnTo?: unknown }
    const cents = dollarsToCents(body.amount)
    if (cents == null) {
      return Response.json(
        { message: `Enter an amount between $${MIN_CUSTOM_USD} and $${MAX_CUSTOM_USD}.` },
        { status: 400 },
      )
    }

    const userId = String(req.user.id)
    const email = typeof req.user.email === 'string' ? req.user.email : undefined
    const dollars = (cents / 100).toFixed(2)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      client_reference_id: userId,
      metadata: { userId, amountCents: String(cents) },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: cents,
            product_data: {
              name: `ArtRealmAI Gen funds ($${dollars})`,
              description: 'USD balance for image generation after your daily free gens.',
            },
          },
        },
      ],
      success_url: body.returnTo === 'account' ? `${SITE_ACCOUNT_URL}?paid=1` : `${SITE_GEN_URL}?paid=1`,
      cancel_url: body.returnTo === 'account' ? SITE_ACCOUNT_URL : SITE_GEN_URL,
    })

    if (!session.url) {
      return Response.json({ message: 'Could not start checkout.' }, { status: 502 })
    }
    return Response.json({ url: session.url })
  },
}

export const genStripeWebhookEndpoint: Endpoint = {
  path: '/gen/stripe-webhook',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    const stripe = stripeClient()
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
    if (!stripe || !webhookSecret) {
      return Response.json({ message: 'Stripe webhook is not configured.' }, { status: 503 })
    }

    const signature = req.headers.get('stripe-signature') || ''
    if (typeof req.text !== 'function') {
      return Response.json({ message: 'Missing body.' }, { status: 400 })
    }
    let rawBody = ''
    try {
      rawBody = await req.text()
    } catch {
      return Response.json({ message: 'Missing body.' }, { status: 400 })
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch {
      return Response.json({ message: 'Invalid Stripe signature.' }, { status: 400 })
    }

    if (event.type !== 'checkout.session.completed') {
      return Response.json({ received: true })
    }

    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status && session.payment_status !== 'paid') {
      return Response.json({ received: true })
    }

    const userId = session.metadata?.userId || session.client_reference_id || ''
    const amountCents = Number(session.metadata?.amountCents || session.amount_total || 0)
    if (!userId || !Number.isFinite(amountCents) || amountCents < 1) {
      return Response.json({ received: true })
    }

    const existing = await req.payload.find({
      collection: 'gen-purchases' as never,
      overrideAccess: true,
      limit: 1,
      where: { stripeSessionId: { equals: session.id } },
    })
    if (existing.docs.length) {
      return Response.json({ received: true, duplicate: true })
    }

    const user = (await req.payload.findByID({
      collection: 'users',
      id: userId,
      depth: 0,
      overrideAccess: true,
    })) as { genBalanceCents?: number | null }

    await req.payload.create({
      collection: 'gen-purchases' as never,
      overrideAccess: true,
      data: {
        user: userId,
        amountCents,
        stripeSessionId: session.id,
      } as never,
    })

    await req.payload.update({
      collection: 'users',
      id: userId,
      overrideAccess: true,
      data: {
        genBalanceCents: (Number(user.genBalanceCents) || 0) + amountCents,
      } as never,
    })

    return Response.json({ received: true })
  },
}

export const stripeWalletEndpoints: Endpoint[] = [genCheckoutEndpoint, genStripeWebhookEndpoint]

export const stripePacksUsd = PACKS_USD
