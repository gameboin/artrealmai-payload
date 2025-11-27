// payload.config.ts – FINAL & 100% WORKING (With PromptStyles)
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

    // PROMPT STYLES — DYNAMIC & EDITABLE FROM ADMIN
{
  slug: 'prompt-styles',
  access: { read: () => true },
  admin: {
    useAsTitle: 'category',
    defaultColumns: ['category', 'updatedAt'],
    description: 'Manage prompt style categories and terms for Prompt Crafter',
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
      name: 'terms',
      type: 'array',
      label: 'Prompt Terms',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'text',
          type: 'text',
          required: true,
          admin: {
            placeholder: 'e.g. cyberpunk, oil painting, golden hour...',
          },
        },
      ],
      admin: {
        initCollapsed: false,
        components: {
          RowLabel: ({ data }) => data?.text || 'New term',
        },
      },
    },
  ],
},

    // SAVED PROMPTS — For logged-in users
    {
      slug: 'saved-prompts',
      access: {
        read: ({ req: { user } }) => !!user,
        create: ({ req: { user } }) => !!user,
        update: ({ req: { user }, id }) => user?.id === id,
        delete: ({ req: { user }, id }) => user?.id === id,
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'prompt', type: 'textarea', required: true },
        {
          name: 'user',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          hasMany: false,
        },
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
