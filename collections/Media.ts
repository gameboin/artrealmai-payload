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

    // Broad allowList optimized for Grok videos + images
    pasteURL: {
      allowList: [
        { hostname: 'grok.com', pathname: '/imagine/post/*' },
        { hostname: 'grok.com' },
        { hostname: 'imagine-public.x.ai' },
        { hostname: 'images-public.x.ai' },
        { hostname: '*.x.ai' },
      ],
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
