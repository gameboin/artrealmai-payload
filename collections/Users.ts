import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: {
    read: () => true,
    create: () => true,
    // IMPORTANT: Only allow users to update THEMSELVES
    update: ({ req: { user }, id }) => {
      if (!user) return false;
      if (user.roles?.includes('admin')) return true;
      return user.id === id; 
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
  // You can delete the 'beforeChange' hook, it is not needed if Access Control is correct.
}