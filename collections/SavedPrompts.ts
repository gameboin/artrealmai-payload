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
    { name: 'title', type: 'text', required: true },
    { name: 'prompt', type: 'textarea', required: true },
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
            // Force the logged-in user to be the owner
            if (operation === 'create' && req.user) {
              return req.user.id;
            }
            return value;
          },
        ],
      },
    },
  ],
}