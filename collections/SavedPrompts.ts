import { CollectionConfig } from 'payload'

export const SavedPrompts: CollectionConfig = {
  slug: 'saved-prompts',
  access: {
    // Anyone logged in can read their own prompts
    read: ({ req: { user } }) => {
      if (!user) return false;
      return {
        user: {
          equals: user.id,
        },
      }
    },
    // Anyone logged in can create
    create: ({ req: { user } }) => !!user,
    
    // FIX: Use query to check existing document ownership
    update: ({ req: { user } }) => {
      if (!user) return false;
      return {
        user: {
          equals: user.id,
        },
      }
    },
    // FIX: Use query to check existing document ownership
    delete: ({ req: { user } }) => {
      if (!user) return false;
      return {
        user: {
          equals: user.id,
        },
      }
    },
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'prompt', type: 'textarea', required: true },
    { 
      name: 'user', 
      type: 'relationship', 
      relationTo: 'users', 
      required: true, 
      hasMany: false,
      // Auto-populate user on create
      hooks: {
        beforeChange: [
          ({ req, operation, value }) => {
            if (operation === 'create' && req.user) {
              return req.user.id
            }
            return value
          },
        ],
      },
    },
  ],
}