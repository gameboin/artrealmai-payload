import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: {
    read: () => true,
    create: () => true,
    // IMPORTANT: Only allow users to update THEMSELVES
    update: ({ req: { user }, id }) => {
      if (!user) return false
      
      // FIX: We cast user to 'any' so TypeScript stops complaining about .roles
      if ((user as any).roles?.includes('admin')) return true
      
      return user.id === id
    },
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['user'],
      options: ['user', 'admin'],
    },
  ],
}