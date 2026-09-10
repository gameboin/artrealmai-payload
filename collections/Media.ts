import { APIError, type CollectionConfig } from 'payload'
import { adminOnly, isAdmin, loggedIn } from '../lib/access'

const USER_UPLOAD_MAX = 2 * 1024 * 1024

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'], 
    
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
    create: loggedIn,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeChange: [
      ({ req, operation, data }) => {
        if (operation !== 'create' || isAdmin(req.user)) return
        const file = req.file as { mimetype?: string; mimeType?: string; size?: number; filesize?: number } | undefined
        const mime = String(file?.mimetype || file?.mimeType || data?.mimeType || '')
        const size = Number(file?.size || file?.filesize || data?.filesize || 0)
        if (mime && !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime)) {
          throw new APIError('Account uploads must be JPEG, PNG, WebP, or GIF.', 400)
        }
        if (size > USER_UPLOAD_MAX) {
          throw new APIError('Images must be under 2 MB.', 400)
        }
      },
    ],
  },
  fields: [
    { 
      name: 'alt', 
      type: 'text' 
    }
  ],
}
