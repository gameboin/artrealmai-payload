import { CollectionConfig } from 'payload'

export const GlossaryTerms: CollectionConfig = {
  slug: 'glossary-terms',
  admin: {
    useAsTitle: 'term',
    defaultColumns: ['term', 'updatedAt'],
  },
  access: {
    // 1. PUBLIC READ ACCESS: This is the critical line.
    read: () => true, 
    
    // 2. RESTRICTED WRITE ACCESS: Only logged-in users (Admins) can edit
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
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