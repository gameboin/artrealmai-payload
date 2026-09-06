import { CollectionConfig } from 'payload'
import { adminOnly } from '../lib/access'

export const GlossaryTerms: CollectionConfig = {
  slug: 'glossary-terms',
  admin: {
    useAsTitle: 'term',
    defaultColumns: ['term', 'updatedAt'],
  },
  access: {
    read: () => true,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'term',
      type: 'text',
      required: true,
      unique: true, // Prevents duplicates
      index: true,
    },
    {
      name: 'definition',
      type: 'richText',
      required: true,
    },
  ],
}