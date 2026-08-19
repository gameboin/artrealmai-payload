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
      name: 'googleId',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Set automatically when the user signs in with Google.',
      },
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['user'],
      options: ['user', 'admin'],
    },
  ],
}