// collections/Users.ts
import type { CollectionConfig, User } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role'],
  },
  auth: true,
  access: {
    create: () => true,
    // This is the ONLY line that works without type errors
    update: ({ req }) => (req.user as User & { role?: 'admin' | 'user' })?.role === 'admin',
    delete: ({ req }) => (req.user as User & { role?: 'admin' | 'user' })?.role === 'admin',
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
