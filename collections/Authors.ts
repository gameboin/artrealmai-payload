// collections/Authors.ts
import { CollectionConfig } from 'payload'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'title', 'slug'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { 
      name: 'slug', 
      type: 'text', 
      required: true, 
      unique: true, 
      index: true,
      admin: { position: 'sidebar' } 
    },
    { name: 'title', type: 'text', label: 'Job Title' },
    { name: 'bio', type: 'textarea', label: 'Biography' },
    { name: 'portrait', type: 'upload', relationTo: 'media', required: true },
    {
      name: 'socials',
      type: 'group',
      label: 'Social Media',
      fields: [
        { name: 'twitter', type: 'text', label: 'Twitter URL' },
        { name: 'linkedin', type: 'text', label: 'LinkedIn URL' },
        { name: 'website', type: 'text', label: 'Website URL' },
      ],
    },
  ],
}

export default Authors