// collections/Users.ts — FINAL WORKING VERSION
import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role'],
  },
  auth: true,
  // THIS IS THE KEY — allow admins to do everything
  access: {
    create: () => true,
    read: () => true,
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
    admin: ({ req }) => req.user?.role === 'admin', // unlocks the UI
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      admin: { position: 'sidebar' },
    },
    {
      name: 'role',
      type: 'select',
      options: ['user', 'admin'],
      defaultValue: 'user',
      required: true,
      access: {
        // Only admins can change roles
        update: ({ req }) => req.user?.role === 'admin',
      },
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

export default Users
