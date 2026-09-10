import { CollectionConfig } from 'payload'

export const SavedPrompts: CollectionConfig = {
  slug: 'saved-prompts',
  access: {
    // Read: Users can only see their own prompts
    read: ({ req: { user } }) => {
      if (!user) return false;
      return { user: { equals: user.id } };
    },

    // Create: Any logged-in user
    create: ({ req: { user } }) => !!user,

    // Update: Users can only update their own prompts
    update: ({ req: { user } }) => {
      if (!user) return false;
      return { user: { equals: user.id } };
    },

    // Delete: Users can only delete their own prompts
    delete: ({ req: { user } }) => {
      if (!user) return false;
      return { user: { equals: user.id } };
    },
  },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 120 },
    { name: 'prompt', type: 'textarea', required: true, maxLength: 20000 },
    { 
      name: 'user', 
      type: 'relationship', 
      relationTo: 'users', 
      required: true, 
      hasMany: false,
      index: true, 
      hooks: {
        beforeChange: [
          ({ req, value }) => {
            if (req.user) return req.user.id
            return value
          },
        ],
      },
    },
  ],
}