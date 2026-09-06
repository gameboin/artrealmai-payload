import { APIError, type CollectionConfig } from 'payload'
import { adminOnly } from '../lib/access'

const TOPICS = ['Advertising', 'Collaboration', 'Bug Report', 'General'] as const

export const ContactSubmissions: CollectionConfig = {
  slug: 'contact-submissions',
  admin: {
    useAsTitle: 'topic',
    defaultColumns: ['topic', 'name', 'email', 'createdAt'],
  },
  access: {
    read: adminOnly,
    create: () => true,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const honey = typeof data.website === 'string' ? data.website.trim() : ''
        if (honey) {
          throw new APIError('Invalid submission.', 400)
        }
        if (typeof data.topic === 'string' && !TOPICS.includes(data.topic as (typeof TOPICS)[number])) {
          throw new APIError('Pick a valid topic.', 400)
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'topic',
      type: 'select',
      required: true,
      options: [
        { label: 'Advertising', value: 'Advertising' },
        { label: 'Collaboration', value: 'Collaboration' },
        { label: 'Technical Issue', value: 'Bug Report' },
        { label: 'General Inquiry', value: 'General' },
      ],
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 80,
    },
    {
      name: 'email',
      type: 'email',
      required: true,
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
      maxLength: 4000,
    },
    {
      name: 'website',
      type: 'text',
      maxLength: 120,
      admin: { hidden: true },
    },
  ],
}

export default ContactSubmissions
