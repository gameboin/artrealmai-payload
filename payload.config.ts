// payload.config.ts – FINAL & BULLETPROOF (November 26, 2025)
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { s3Storage } from '@payloadcms/storage-s3'

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

  collections: [
    {
      ...Users,
      slug: 'users',
      auth: {
        tokenExpiration: 7200,
        verify: false,
        maxLoginAttempts: 5,
        lockTime: 600,
        useAPIKey: false,
      },
      access: {
        read: ({ req: { user } }) => !!user,
        create: () => true,
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
            create: () => false,
            update: ({ req: { user } }) => (user as any)?.roles?.includes('admin'),
          },
          admin: {
            condition: ({ user }) => (user as any)?.roles?.includes('admin'),
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
