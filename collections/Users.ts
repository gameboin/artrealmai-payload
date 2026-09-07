import { APIError, type CollectionConfig } from 'payload'
import { isAdmin, systemWrite } from '../lib/access'
import { assertHandle, clipBio, normalizeHandle } from '../lib/handle'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    useAPIKey: true,
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    cookies: {
      secure: true,
      sameSite: 'Lax',
    },
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
  hooks: {
    beforeValidate: [
      ({ data }) => {
        const password = data && typeof data.password === 'string' ? data.password : ''
        if (password && password.length < 8) {
          throw new APIError('Password must be at least 8 characters.', 400)
        }
        return data
      },
    ],
    beforeChange: [
      async ({ req, data, operation, originalDoc, context }) => {
        if (!data) return data
        if ('realm' in data && !('handle' in data)) data.handle = data.realm
        if ('handle' in data) {
          const handle = normalizeHandle(data.handle)
          if (!handle) {
            data.handle = null
          } else {
            assertHandle(handle)
            data.handle = handle
            const existing = await req.payload.find({
              collection: 'users' as never,
              overrideAccess: true,
              depth: 0,
              limit: 1,
              where: { handle: { equals: handle } },
            })
            const other = existing.docs[0] as { id?: string } | undefined
            const selfId = String(originalDoc?.id || (operation === 'update' ? req.user?.id : '') || '')
            if (other?.id && String(other.id) !== selfId) {
              throw new APIError('That realm is taken.', 400)
            }
          }
        }
        if (typeof data.bio === 'string') data.bio = clipBio(data.bio)
        if (isAdmin(req.user)) return data
        if ((context as { systemQuota?: boolean } | undefined)?.systemQuota) return data
        if (req.payloadAPI !== 'REST') return data
        const next = { ...data }
        delete next.roles
        delete next.googleId
        delete next.genFailStreak
        delete next.genPenaltySlots
        delete next.genPenaltyDay
        delete next.genBlockCount
        delete next.genRejectCount
        delete next.genBalanceCents
        delete next.logoLayerDay
        delete next.logoLayerBatches
        delete next.enableAPIKey
        delete next.apiKey
        delete next.apiKeyIndex
        if (operation === 'update') delete next.email
        return next
      },
    ],
    afterRead: [
      ({ doc, req, context }) => {
        if (!doc) return doc
        const row = doc as Record<string, unknown>
        delete row.hash
        delete row.salt
        delete row.resetPasswordToken
        delete row.resetPasswordExpiration
        delete row.apiKeyIndex
        // Local API reads from charge/status endpoints must keep quota fields.
        // REST clients still should not see them.
        const systemRead = Boolean((context as { systemQuota?: boolean } | undefined)?.systemQuota)
        if (!isAdmin(req.user) && req.payloadAPI === 'REST' && !systemRead) {
          delete row.apiKey
          delete row.enableAPIKey
          delete row.googleId
          delete row.genFailStreak
          delete row.genPenaltySlots
          delete row.genPenaltyDay
          delete row.genBlockCount
          delete row.genRejectCount
          delete row.logoLayerDay
          delete row.logoLayerBatches
        }
        return row
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 80 },
    {
      name: 'handle',
      type: 'text',
      index: true,
      minLength: 3,
      maxLength: 24,
      label: 'Realm',
      admin: {
        description: 'Public URL: artrealmai.com/u/your_realm. Letters, numbers, underscores.',
      },
    },
    {
      name: 'bio',
      type: 'textarea',
      maxLength: 280,
      admin: { description: 'Short public bio on /u/your_realm.' },
    },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
    {
      name: 'googleId',
      type: 'text',
      index: true,
      access: {
        ...systemWrite,
        read: ({ req: { user } }) => isAdmin(user),
      },
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
        create: ({ req: { user } }) => isAdmin(user),
        update: ({ req: { user } }) => isAdmin(user),
      },
    },
    {
      name: 'genFailStreak',
      type: 'number',
      defaultValue: 0,
      access: { ...systemWrite, read: ({ req: { user } }) => isAdmin(user) },
      admin: { hidden: true },
    },
    {
      name: 'genPenaltySlots',
      type: 'number',
      defaultValue: 0,
      access: { ...systemWrite, read: ({ req: { user } }) => isAdmin(user) },
      admin: { hidden: true },
    },
    {
      name: 'genPenaltyDay',
      type: 'text',
      access: { ...systemWrite, read: ({ req: { user } }) => isAdmin(user) },
      admin: { hidden: true },
    },
    {
      name: 'genBlockCount',
      type: 'number',
      defaultValue: 0,
      access: { ...systemWrite, read: ({ req: { user } }) => isAdmin(user) },
      admin: { hidden: true },
    },
    {
      name: 'genRejectCount',
      type: 'number',
      defaultValue: 0,
      access: { ...systemWrite, read: ({ req: { user } }) => isAdmin(user) },
      admin: { hidden: true },
    },
    {
      name: 'genBalanceCents',
      type: 'number',
      defaultValue: 0,
      access: {
        ...systemWrite,
        read: ({ req: { user } }) => Boolean(user),
      },
      admin: {
        description: 'USD wallet in cents. Changed only by Stripe webhooks and paid gens.',
        readOnly: true,
      },
    },
    {
      name: 'logoLayerDay',
      type: 'text',
      access: { ...systemWrite, read: ({ req: { user } }) => isAdmin(user) },
      admin: { hidden: true },
    },
    {
      name: 'logoLayerBatches',
      type: 'number',
      defaultValue: 0,
      access: { ...systemWrite, read: ({ req: { user } }) => isAdmin(user) },
      admin: { hidden: true },
    },
  ],
}
