import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*', 'video/*'], 
    
    // FIX: We cast 'doc.mimeType' to string to satisfy TypeScript
    adminThumbnail: ({ doc }) => {
      const mimeType = doc?.mimeType as string

      // If the file is a video, don't try to resize it (prevents "Unknown Error")
      if (mimeType?.includes('video')) {
        return null
      }
      // For images, return the default thumbnail behavior
      return 'thumbnail' 
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