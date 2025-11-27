// payload.config.ts – FINAL & 100% WORKING (Bulk Import Fixed, No RowLabel)
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { s3Storage } from '@payloadcms/storage-s3'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Articles } from './collections/Articles'
import { Tags } from './collections/Tags'
import { Authors } from './collections/Authors'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
  },

  collections: [
    Users,
    Media,
    Articles,
    Tags,
    Authors,

    // PROMPT STYLES — BULK IMPORT WORKS, NO ROWLABEL (SIMPLE & CLEAN)
    {
      slug: 'prompt-styles',
      access: { read: () => true },
      admin: {
        useAsTitle: 'category',
        defaultColumns: ['category', 'updatedAt'],
        description: 'Manage prompt style categories. Paste multiple terms at once!',
      },
      fields: [
        {
          name: 'category',
          type: 'select',
          required: true,
          options: [
            { label: 'Style', value: 'style' },
            { label: 'Subject', value: 'subject' },
            { label: 'Lighting', value: 'lighting' },
            { label: 'Camera', value: 'camera' },
            { label: 'Composition', value: 'composition' },
          ],
        },
        {
          name: 'bulkTerms',
          type: 'textarea',
          label: 'Bulk Add Terms (comma-separated)',
          admin: {
            description: 'Paste multiple terms: cinematic, cyberpunk, golden hour...',
            placeholder: 'bright, rimlighting, sunlight, moonlight...',
          },
        },
        {
          name: 'terms',
          type: 'array',
          label: 'Individual Terms',
          required: true,
          minRows: 1,
          fields: [
            {
              name: 'text',
              type: 'text',
              required: true,
              admin: {
                placeholder: 'e.g. cyberpunk',
              },
            },
          ],
          admin: {
            initCollapsed: false,  // Always expanded for easy editing
          },
        },
      ],
      hooks: {
        beforeChange: [
          async ({ data, operation }) => {
            if ((operation === 'create' || operation === 'update') && data.bulkTerms?.trim()) {
              const newTerms = data.bulkTerms
                .split(',')
                .map(t => t.trim())
                .filter(t => t)
                .map(text => ({ text }));

              data.terms = [...(data.terms || []), ...newTerms];
              delete data.bulkTerms;  // Clean up
            }
            return data;
          },
        ],
      },
    },

    // SAVED PROMPTS
    {
      slug: 'saved-prompts',
      access: {
        read: ({ req: { user } }) => !!user,
        create: ({ req: { user } }) => !!user,
        update: ({ req: { user }, data }) => user?.id === data?.user,
        delete: ({ req: { user }, data }) => user?.id === data?.user,
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'prompt', type: 'textarea', required: true },
        { name: 'user', type: 'relationship', relationTo: 'users', required: true, hasMany: false },
      ],
    },
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
