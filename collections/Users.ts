// collections/Users.ts
import type { CollectionConfig } from 'payload'

// Define the shape of your user
type User = {
  id: string
  email: string
  name?: string
  role: 'user' | 'admin'
  createdAt: string
  updatedAt: string
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role'],
  },
  auth: true,
  access: {
    create: () => true,
    // Now TypeScript knows req.user has a role field
    update: ({ req }: { req: { user?: User } }) => req.user?.role === 'admin',
    delete: ({ req }: { req: { user?: User } }) => req.user?.role === 'admin',
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
      options: [
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
      ],
      defaultValue: 'user',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
  ],
  // This tells Payload your user has these fields
  typescript: {
    interface: 'User',
  },
}

export default Users
