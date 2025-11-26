import { CollectionConfig } from 'payload/types'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
    { name: 'roles', type: 'select', hasMany: true, defaultValue: ['user'], options: ['user', 'admin'] },
  ],
}
