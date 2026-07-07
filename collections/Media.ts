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

    // Very permissive for Grok videos + images
    pasteURL: {
      allowList: [
        { hostname: 'grok.com' },
        { hostname: 'grok.com', pathname: '/imagine/post/*' },
        { hostname: 'imagine-public.x.ai' },
        { hostname: 'imagine-public.x.ai', pathname: '/imagine-public/share-videos/*' },
        { hostname: 'imagine-public.x.ai', pathname: '/imagine-public/share-images/*' },
        { hostname: 'images-public.x.ai' },
        { hostname: '*.x.ai' },
      ],
    },

    // Also skip safe fetch check for these domains
    skipSafeFetch: [
      { hostname: 'grok.com' },
      { hostname: 'imagine-public.x.ai' },
      { hostname: 'images-public.x.ai' },
      { hostname: '*.x.ai' },
    ],
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
