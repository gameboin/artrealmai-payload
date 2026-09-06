// collections/Authors.ts
import { CollectionConfig } from 'payload'
import { adminOnly } from '../lib/access'
import { applySlug } from '../lib/slug'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'title', 'slug'],
    preview: (doc) =>
      typeof doc?.slug === 'string' && doc.slug
        ? `https://artrealmai.com/author/${doc.slug}`
        : null,
  },
  access: {
    read: () => true,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { 
      name: 'slug', 
      type: 'text', 
      required: true, 
      unique: true, 
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Public URL: artrealmai.com/author/this-slug. Auto-filled from the name if left blank.',
      },
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
  hooks: {
    beforeValidate: [
      ({ data }) => applySlug(data),
    ],
  },
}

export default Authors