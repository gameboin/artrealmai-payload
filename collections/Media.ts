import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*', 'video/*'], 
    
    adminThumbnail: ({ doc }) => {
      const mimeType = doc?.mimeType as string
      if (mimeType?.includes('image')) {
        return 'thumbnail'
      }
      return null
    },
    // pasteURL removed for now - falls back to default client-side
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    { 
      name: 'alt', 
      type: 'text' 
    }
  ],
}
