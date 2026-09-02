import type { CollectionConfig } from 'payload'

export const Generations: CollectionConfig = {
  slug: 'generations',
  admin: {
    useAsTitle: 'prompt',
    defaultColumns: ['prompt', 'model', 'user', 'createdAt'],
    description: 'Images created on /gen. Written only by the generate API.',
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if ((user as { roles?: string[] }).roles?.includes('admin')) return true
      return { user: { equals: user.id } }
    },
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) => {
      if (!user) return false
      if ((user as { roles?: string[] }).roles?.includes('admin')) return true
      return { user: { equals: user.id } }
    },
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'prompt', type: 'textarea', required: true },
    { name: 'model', type: 'text', required: true },
    { name: 'imageSize', type: 'text' },
    { name: 'seed', type: 'number' },
    { name: 'url', type: 'text', required: true },
    { name: 'width', type: 'number' },
    { name: 'height', type: 'number' },
  ],
}
