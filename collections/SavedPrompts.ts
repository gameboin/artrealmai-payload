import { CollectionConfig } from 'payload'

export const SavedPrompts: CollectionConfig = {
  slug: 'saved-prompts',
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false;
      return { user: { equals: user.id } };
    },

    create: ({ req: { user } }) => {
      // DEBUG LOG
      if (!user) console.log('⛔ Create Blocked: No User found in request.');
      return !!user;
    },

    update: ({ req: { user }, id }) => {
      if (!user) {
        console.log('⛔ Update Blocked: No User found.');
        return false;
      }
      // Log who is trying to update what
      console.log(`👤 User ${user.email} (ID: ${user.id}) trying to update Prompt ID: ${id}`);
      
      // Allow update ONLY if the doc belongs to user
      return {
        user: {
          equals: user.id,
        },
      }
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
      index: true, // Speeds up the "My Prompts" query
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