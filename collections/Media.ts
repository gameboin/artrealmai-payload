import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*', 'video/*'], 
    
    // FAIL-SAFE FIX: Only try to make thumbnails if we are 100% sure it is an image.
    adminThumbnail: ({ doc }) => {
      const mimeType = doc?.mimeType as string

      // If it is strictly an image, make a thumbnail.
      if (mimeType?.includes('image')) {
        return 'thumbnail'
      }

      // For EVERYTHING else (videos, unknown files, PDFs), return null.
      // This prevents the "Unknown Error" crash on weird video files.
      return null
    },
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