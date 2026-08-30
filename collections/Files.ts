import type { CollectionConfig } from 'payload'

export const Files: CollectionConfig = {
  slug: 'files',
  labels: {
    singular: 'File',
    plural: 'Files',
  },
  admin: {
    useAsTitle: 'filename',
    description: 'Any file type for article downloads (JSON, ZIP, PDF, etc.). Use the File Download block in an article to attach one.',
    defaultColumns: ['filename', 'mimeType', 'filesize', 'updatedAt'],
    enableRichTextRelationship: true,
  },
  upload: {
    staticDir: 'files',
    crop: false,
    focalPoint: false,
    // No mimeTypes: JSON, ZIP, PDF, and other non-media files are allowed here.
    // Images and videos stay in Media so the featured-image picker stays clean.
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      admin: {
        description: 'Optional display name on the download card. Defaults to the filename.',
      },
    },
  ],
}
