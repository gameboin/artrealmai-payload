import { CollectionConfig } from 'payload'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'title', 'slug'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean((user as any)?.roles?.includes('admin')),
    update: ({ req: { user } }) => Boolean((user as any)?.roles?.includes('admin')),
    delete: ({ req: { user } }) => Boolean((user as any)?.roles?.includes('admin')),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'URL-friendly name (e.g. aurelia)',
        position: 'sidebar',
      },
    },
    {
      name: 'title',
      type: 'text',
      label: 'Job Title',
      admin: {
        description: 'e.g. Lead Tech Writer',
      },
    },
    {
      name: 'bio',
      type: 'textarea',
      label: 'Biography',
    },
    {
      name: 'portrait',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    // Social Links Group
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