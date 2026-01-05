import { CollectionConfig } from 'payload'

export const ContactSubmissions: CollectionConfig = {
  slug: 'contact-submissions',
  admin: {
    useAsTitle: 'topic',
    defaultColumns: ['topic', 'name', 'email', 'createdAt'],
  },
  access: {
    // Only logged-in users can see submissions, but anyone can create one
    read: ({ req: { user } }) => !!user,
    create: () => true, 
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
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
    },
  ],
}

export default ContactSubmissions