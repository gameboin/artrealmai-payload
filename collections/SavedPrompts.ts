import { CollectionConfig } from 'payload'

export const SavedPrompts: CollectionConfig = {
  slug: 'saved-prompts',
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false;
      return { user: { equals: user.id } };
    },

    // UPDATED DEBUGGING LOGIC
    create: ({ req }) => {
      const authHeader = req.headers.get('authorization');
      const user = req.user;
      
      console.log('--- SAVE DEBUG ---');
      console.log('1. Header received:', authHeader ? 'YES' : 'NO');
      console.log('2. Header value:', authHeader); 
      console.log('3. User found:', user ? user.email : 'NULL');
      
      // If user exists, allow. Otherwise, deny.
      return !!user;
    },

    update: ({ req: { user }, id }) => {
      if (!user) return false;
      return { user: { equals: user.id } };
    },

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
      hooks: {
        beforeChange: [
          ({ req, operation, value }) => {
            if (operation === 'create' && req.user) return req.user.id;
            return value;
          },
        ],
      },
    },
  ],
}