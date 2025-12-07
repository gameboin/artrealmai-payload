import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    // 'staticDir' is required by Payload even if using R2 (it uses it for temp storage)
    staticDir: 'media', 
    
    // 1. ALLOW ALL VIDEO & IMAGE TYPES
    // Using 'video/*' is the most lenient setting possible. 
    // It accepts mp4, mov, avi, mkv, webm, etc.
    mimeTypes: ['image/*', 'video/*'], 

    // 2. OPTIONAL: CLIENT-SIDE SIZE CHECK
    // This helps give a clear error immediately if a file is huge 
    // (e.g., limit to 2GB = 2147483648 bytes)
    // adminThumbnail: 'thumbnail',
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