// payload.config.ts – FIXED & TYPE-SAFE (November 26, 2025)
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { s3Storage } from '@payloadcms/storage-s3'

// ←←← MANUAL TYPE EXTENSION – FIXES TS ERROR ←←←
declare module 'payload' {
  export interface User {
    name?: string;
    avatar?: {
      id: string;
      url: string;
    };
    roles?: ('user' | 'admin')[];
  }
}

import { Authors } from './collections/Authors'
import { Articles } from './collections/Articles'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { Media } from './collections/Media'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },

  // ←←← AUTH + AVATAR – NOW TYPE-SAFE ←←←
  collections: [
    {
      ...Users,
      slug: 'users',
      auth: {
        tokenExpiration: 7200,        // 2 hours
        verify: false,                // Enable later for email verification
        maxLoginAttempts: 5,
        lockTime: 600,                // 10 min lockout
        useAPIKey: false,
      },
      access: {
        read: ({ req: { user } }) => !!user,
        create: () => true,           // Allow registration
        update: ({ req: { user }, id }) => user?.id === id,
        delete: ({ req: { user }, id }) => user?.id === id,
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          label: 'Full Name',
        },
        {
          name: 'avatar',
          type: 'upload',
          relationTo: 'media',
          label: 'Profile Picture',
          admin: {
            description: 'Square image recommended (e.g., 400x400px)',
          },
        },
        {
          name: 'roles',
          type: 'select',
          hasMany: true,
          defaultValue: ['user'],
          options: [
            { label: 'User', value: 'user' },
            { label: 'Admin', value: 'admin' },
          ],
          access: {
            read: () => true,
            create: () => false,      // Can't self-assign roles
            update: ({ req: { user } }) => user?.roles?.includes('admin'),  // ← NOW TYPE-SAFE
          },
          admin: {
            condition: ({ user }) => user?.roles?.includes('admin'),  // Admin-only visible
          },
        },
      ],
    },
    Media,
    Authors,
    Articles,
    Tags,
  ],

  editor: lexicalEditor(),

  secret: process.env.PAYLOAD_SECRET || 'fallback-secret-change-in-prod',

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
  }),

  sharp,

  // ←←← CORS/CSRF – OPTIMIZED ←←←
  cors: [
    'https://artrealmai.com',
    'https://www.artrealmai.com',
    'http://localhost:3000',
  ],
  csrf: [
    'https://artrealmai.com',
    'https://www.artrealmai.com',
    'http://localhost:3000',
  ],

  plugins: [
    s3Storage({
      collections: {
        media: {
          generateFileURL: ({ filename }) =>
            `https://${process.env.R2_PUBLIC_ACCESS_DOMAIN}/${filename}`,
        },
      },
      bucket: process.env.R2_BUCKET!,
      config: {
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
        region: 'auto',
      },
    }),
  ],
})
