import type { CollectionConfig } from 'payload'

function isAdmin(user: unknown) {
  return Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
}

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    useAPIKey: true,
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (isAdmin(user)) return true
      return { id: { equals: user.id } }
    },
    create: () => true,
    update: ({ req: { user }, id }) => {
      if (!user) return false
      if (isAdmin(user)) return true
      return user.id === id
    },
    delete: ({ req: { user } }) => isAdmin(user),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
    {
      name: 'googleId',
      type: 'text',
      index: true,
      access: { update: () => false },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Set automatically when the user signs in with Google.',
      },
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['user'],
      options: ['user', 'admin'],
      access: {
        create: () => false,
        update: ({ req: { user } }) => isAdmin(user),
      },
    },
    {
      name: 'genFailStreak',
      type: 'number',
      defaultValue: 0,
      access: { update: () => false },
      admin: { hidden: true },
    },
    {
      name: 'genPenaltySlots',
      type: 'number',
      defaultValue: 0,
      access: { update: () => false },
      admin: { hidden: true },
    },
    {
      name: 'genPenaltyDay',
      type: 'text',
      access: { update: () => false },
      admin: { hidden: true },
    },
    {
      name: 'genBlockCount',
      type: 'number',
      defaultValue: 0,
      access: { update: () => false },
      admin: { hidden: true },
    },
    {
      name: 'genRejectCount',
      type: 'number',
      defaultValue: 0,
      access: { update: () => false },
      admin: { hidden: true },
    },
    {
      name: 'genBalanceCents',
      type: 'number',
      defaultValue: 0,
      access: { update: () => false },
      admin: {
        description: 'USD wallet in cents. Changed only by Stripe webhooks and paid gens.',
        readOnly: true,
      },
    },
  ],
}