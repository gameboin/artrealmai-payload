import { APIError, type CollectionConfig } from 'payload'

const MAX_SAVED_LOGOS = 24

export const SavedLogos: CollectionConfig = {
  slug: 'saved-logos',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'user', 'updatedAt'],
    description: 'User-saved overlay logos for Logo Layer Image.',
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      return { user: { equals: user.id } }
    },
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => {
      if (!user) return false
      return { user: { equals: user.id } }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      return { user: { equals: user.id } }
    },
  },
  hooks: {
    beforeValidate: [
      async ({ req, operation, data }) => {
        if (operation === 'create' && req.user) {
          const existing = await req.payload.count({
            collection: 'saved-logos' as never,
            where: { user: { equals: req.user.id } },
            overrideAccess: true,
          })
          if (existing.totalDocs >= MAX_SAVED_LOGOS) {
            throw new APIError('You can save up to 24 logos.', 400)
          }
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 80 },
    {
      name: 'thumb',
      type: 'textarea',
      required: true,
      maxLength: 8000000,
      admin: { hidden: true },
    },
    {
      name: 'dataUrl',
      type: 'textarea',
      required: true,
      maxLength: 8000000,
      admin: { hidden: true },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      hasMany: false,
      index: true,
      hooks: {
        beforeChange: [
          ({ req, operation, value }) => {
            if (operation === 'create' && req.user) return req.user.id
            return value
          },
        ],
      },
    },
  ],
}
