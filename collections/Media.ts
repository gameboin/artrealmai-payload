// collections/Media.ts
import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'updatedAt'],
  },
  access: {
    read: () => true, // Public can view images
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'alt',
      label: 'Alt Text',
      type: 'text',
      required: true,
      admin: {
        description: 'Describe the image for accessibility and SEO',
      },
    },
  ],
  upload: {
    // Optional: limit file types and size
    mimeTypes: ['image/*', 'video/mp4', 'video/webm'],
    staticDir: '../public/uploads', // only needed if using local storage (not R2)
  },
}

export default Media
