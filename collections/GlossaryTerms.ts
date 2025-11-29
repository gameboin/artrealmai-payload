import { CollectionConfig } from 'payload'

export const GlossaryTerms: CollectionConfig = {
  slug: 'glossary-terms',
  admin: {
    useAsTitle: 'term',
    defaultColumns: ['term', 'updatedAt'],
  },
  access: {
    read: () => true, // Publicly readable
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    {
      name: 'term',
      type: 'text',
      required: true,
      unique: true, // No duplicates allowed
      index: true,
    },
    {
      name: 'definition',
      type: 'richText',
      required: true,
    },
  ],
}