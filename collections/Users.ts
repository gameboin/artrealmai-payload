// collections/Users.ts — FINAL VERSION THAT WORKS ON RENDER
import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role'],
  },
  auth: true,
  access: {
    create: () => true,
    read: () => true,
    // THIS LINE IS THE ONLY ONE THAT WORKS — type assertion with proper typing
    update: ({ req }) => (req.user as { role?: 'user' | 'admin' })?.role === 'admin',
    delete: ({ req }) => (req.user as { role?: 'user' | 'admin' })?.role === 'admin',
    admin: ({ req }) => (req.user as { role?: 'user' | 'admin' })?.role === 'admin',
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
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

export default Users
