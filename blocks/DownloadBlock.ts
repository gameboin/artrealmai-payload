import type { Block } from 'payload'

export const DownloadBlock: Block = {
  slug: 'download',
  interfaceName: 'DownloadBlock',
  labels: {
    singular: 'File Download',
    plural: 'File Downloads',
  },
  fields: [
    {
      name: 'file',
      type: 'upload',
      relationTo: 'files',
      required: true,
      displayPreview: true,
      admin: {
        description: 'Upload any file (JSON, ZIP, PDF, etc.) for readers to download in one click.',
      },
    },
    {
      name: 'title',
      type: 'text',
      admin: {
        description: 'Optional card title. Defaults to the file name.',
      },
    },
  ],
}
