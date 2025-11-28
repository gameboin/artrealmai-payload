import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: true,
  access: {
    read: () => true,
    // Only logged-in users can upload. 
    // If req.user is missing (the real issue), this fails safely.
    create: ({ req: { user } }) => !!user, 
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [{ name: 'alt', type: 'text' }],
}