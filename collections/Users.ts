// collections/Users.ts
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
    // Type assertion fixes the error — treats req.user as having 'role'
    update: ({ req }) => (req.user as any)?.role === 'admin',
    delete: ({ req }) => (req.user as any)?.role === 'admin',
    admin: ({ req }) => (req.user as any)?.role === 'admin',
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
