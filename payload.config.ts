// payload.config.ts
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { 
  lexicalEditor,
  HeadingFeature,
  BlockquoteFeature,
  LinkFeature,
  ParagraphFeature,
  UploadFeature,
  OrderedListFeature,
  UnorderedListFeature,
  ChecklistFeature,      
  IndentFeature,
  AlignFeature,
  HorizontalRuleFeature,
  BoldFeature,           
  ItalicFeature,         
  UnderlineFeature,      
  StrikethroughFeature,  
  SubscriptFeature,      
  SuperscriptFeature,    
  InlineCodeFeature,
  FixedToolbarFeature, // <--- NEW IMPORT: Adds the top toolbar controls
  InlineToolbarFeature, // <--- NEW IMPORT: Adds the popup bar on text selection
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { s3Storage } from '@payloadcms/storage-s3'

import { collections } from './collections' 
import { GlossaryImporter } from './globals/GlossaryImporter'

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
      
      // 1. FORCE TOOLBARS TO APPEAR
      FixedToolbarFeature(),
      InlineToolbarFeature(),

      // 2. Content Features
      HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }),
      BlockquoteFeature(),
      LinkFeature({}),
      ParagraphFeature(),
      UploadFeature({
        collections: {
          media: {
            fields: [{ name: 'caption', type: 'text', label: 'Caption' }],
          },
        },
      }),
      OrderedListFeature(),
      UnorderedListFeature(),
      ChecklistFeature(),
      IndentFeature(),
      AlignFeature(),
      HorizontalRuleFeature(),
      
      // 3. Text Formatting
      BoldFeature(),
      ItalicFeature(),
      UnderlineFeature(),
      StrikethroughFeature(),
      SubscriptFeature(), 
      SuperscriptFeature(), 
      InlineCodeFeature(), 
    ],
  }),

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