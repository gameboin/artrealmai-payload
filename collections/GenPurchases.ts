import type { CollectionConfig } from 'payload'

export const GenPurchases: CollectionConfig = {
  slug: 'gen-purchases',
  admin: {
    useAsTitle: 'stripeSessionId',
    defaultColumns: ['user', 'amountCents', 'createdAt'],
    description: 'Stripe Checkout payments that added Gen wallet funds.',
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if ((user as { roles?: string[] }).roles?.includes('admin')) return true
      return { user: { equals: user.id } }
    },
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'amountCents', type: 'number', required: true },
    {
      name: 'stripeSessionId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
  ],
}
