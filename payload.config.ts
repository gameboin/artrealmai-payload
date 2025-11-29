// payload.config.ts
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { s3Storage } from '@payloadcms/storage-s3'

// Collection Imports (from ./collections)
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Articles } from './collections/Articles'
import { Tags } from './collections/Tags'
import { Authors } from './collections/Authors'
import { GlossaryTerms } from './collections/GlossaryTerms'
import { PromptStyles } from './collections/PromptStyles' // <--- Imported from new file

// Global Imports (assuming you have a globals folder, if not create one at root)
import { GlossaryImporter } from './globals/GlossaryImporter'

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
    GlossaryTerms,
    PromptStyles, // <--- Clean and simple!

    // SAVED PROMPTS (Inline for now)
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

  globals: [
    GlossaryImporter,
  ],

  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'fallback-secret',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: mongooseAdapter({ url: process.env.DATABASE_URI || '' }),
  sharp,

  cors: [
    'https://artrealmai.com',
    'https://www.artrealmai.com',
    'http://localhost:3000',
    'http://localhost:5500', 
    'http://127.0.0.1:5500', 
  ],
  csrf: [
    'https://artrealmai.com',
    'https://www.artrealmai.com',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://artrealmai-payload.onrender.com',
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