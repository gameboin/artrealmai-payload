import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { 
  lexicalEditor,
  FixedToolbarFeature,
  InlineToolbarFeature,
  BlocksFeature, 
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { s3Storage } from '@payloadcms/storage-s3'

import { collections } from './collections' 
import { GlossaryImporter } from './globals/GlossaryImporter'
import { CodeBlock } from './blocks/CodeBlock'
import { DownloadBlock } from './blocks/DownloadBlock'
import { googleAuthEndpoints } from './endpoints/googleAuth'
import { fileDownloadEndpoint } from './endpoints/fileDownload'
import { generateImageEndpoints } from './endpoints/generateImage'
import { generateVideoEndpoints } from './endpoints/generateVideo'
import { stripeWalletEndpoints } from './endpoints/stripeWallet' 

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const payloadSecret = process.env.PAYLOAD_SECRET || ''
if (!payloadSecret && process.env.VERCEL) {
  throw new Error('PAYLOAD_SECRET is required')
}

const siteOrigins = ['https://artrealmai.com', 'https://www.artrealmai.com']
const localOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:8080',
  'http://localhost:8080',
]
const vercelOrigins = [
  process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '',
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
].filter(Boolean)
const corsOrigins = [
  ...siteOrigins,
  ...vercelOrigins,
  ...(process.env.VERCEL_ENV === 'production' ? [] : localOrigins),
]

export default buildConfig({
  admin: {
    user: 'users',
    importMap: { baseDir: path.resolve(dirname) },
  },

  graphQL: {
    disable: true,
  },

  collections: collections,
  endpoints: [...googleAuthEndpoints, fileDownloadEndpoint, ...generateImageEndpoints, ...generateVideoEndpoints, ...stripeWalletEndpoints], 

  globals: [
    GlossaryImporter,
  ],

  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
      FixedToolbarFeature(),
      InlineToolbarFeature(),
      
      // REGISTER CUSTOM BLOCK
      BlocksFeature({
        blocks: [CodeBlock, DownloadBlock],
      }),
    ],
  }),

  secret: payloadSecret || 'dev-only-not-for-production',
  typescript: { outputFile: path.resolve(dirname, 'src/payload-types.ts') },
  db: mongooseAdapter({ url: process.env.DATABASE_URI || '' }),
  sharp,

  cors: corsOrigins,
  csrf: [...corsOrigins, 'https://artrealmai-payload.onrender.com'].filter(Boolean),

  plugins: [
    s3Storage({
      collections: {
        media: {
          generateFileURL: ({ filename }) =>
            `https://${process.env.R2_PUBLIC_ACCESS_DOMAIN}/${filename}`,
        },
        files: {
          prefix: 'downloads',
          generateFileURL: ({ filename }) =>
            `https://${process.env.R2_PUBLIC_ACCESS_DOMAIN}/downloads/${filename}`,
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
      // ADDED: This prevents Payload from trying to write to the Vercel read-only disk
      disableLocalStorage: true,
    }),
  ],
})