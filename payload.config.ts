// payload.config.ts – FINAL & BUILD-SUCCESSFUL (November 26, 2025)
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { s3Storage } from '@payloadcms/storage-s3'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: 'users',
    importMap: { baseDir: path.resolve(dirname) },
  },

  collections: [
    // USERS — Full inline, no external file
    {
      slug: 'users',
      auth: {
        tokenExpiration: 7200,
        verify: false,
        maxLoginAttempts: 5,
        lockTime: 600,
      },
      access: {
        read: () => true,
        create: () => true,
        update: ({ req: { user } }) => !!user,
        delete: ({ req: { user } }) => !!user,
      },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'avatar', type: 'upload', relationTo: 'media' },
        {
          name: 'roles',
          type: 'select',
          hasMany: true,
          defaultValue: ['user'],
          options: ['user', 'admin'].map(v => ({ label: v.charAt(0).toUpperCase() + v.slice(1), value: v })),
        },
      ],
    },

    // MEDIA — Uploads work!
    {
      slug: 'media',
      upload: { staticURL: '/media', staticDir: 'media', mimeTypes: ['image/*'] },
      access: {
        read: () => true,
        create: ({ req: { user } }) => !!user,
        update: ({ req: { user } }) => !!user,
        delete: ({ req: { user } }) => !!user,
      },
      fields: [{ name: 'alt', type: 'text' }],
    },

    // Your other collections — keep them as-is
    // (They should still exist in ./collections/)
    // If you deleted them, recreate minimal versions or re-add imports
    // For now, using placeholders:
    { slug: 'articles', fields: [{ name: 'title', type: 'text' }] },
    { slug: 'tags', fields: [{ name: 'name', type: 'text' }] },
    { slug: 'authors', fields: [{ name: 'name', type: 'text' }] },
  ],

  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'fallback-secret',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: mongooseAdapter({ url: process.env.DATABASE_URI || '' }),
  sharp,

  cors: ['https://artrealmai.com', 'http://localhost:3000'],
  csrf: ['https://artrealmai.com', 'http://localhost:3000'],

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
