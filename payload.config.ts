// payload.config.ts
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { 
  lexicalEditor,
  FixedToolbarFeature,
  InlineToolbarFeature,
  BlocksFeature, // Required for Custom Blocks
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { s3Storage } from '@payloadcms/storage-s3'

import { collections } from './collections' 
import { GlossaryImporter } from './globals/GlossaryImporter'
import { CodeBlock } from './blocks/CodeBlock' // <--- Import the new block

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: 'users',
    importMap: { baseDir: path.resolve(dirname) },
  },

  collections: collections, 

  globals: [
    GlossaryImporter,
  ],

  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
      FixedToolbarFeature(),
      InlineToolbarFeature(),
      
      // REGISTER THE CUSTOM BLOCK
      BlocksFeature({
        blocks: [CodeBlock],
      }),
    ],
  }),

  secret: process.env.PAYLOAD_SECRET || 'fallback-secret',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: mongooseAdapter({ url: process.env.DATABASE_URI || '' }),
  sharp,

  cors: [
    '[https://artrealmai.com](https://artrealmai.com)',
    '[https://www.artrealmai.com](https://www.artrealmai.com)',
    'http://localhost:3000',
    'http://localhost:5500', 
    '[http://127.0.0.1:5500](http://127.0.0.1:5500)', 
  ],
  csrf: [
    '[https://artrealmai.com](https://artrealmai.com)',
    '[https://www.artrealmai.com](https://www.artrealmai.com)',
    'http://localhost:3000',
    'http://localhost:5500',
    '[http://127.0.0.1:5500](http://127.0.0.1:5500)',
    '[https://artrealmai-payload.onrender.com](https://artrealmai-payload.onrender.com)',
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