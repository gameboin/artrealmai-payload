import { Block } from 'payload'

export const Code: Block = {
  slug: 'code', // This is the ID we use in the database
  labels: {
    singular: 'Code Block',
    plural: 'Code Blocks',
  },
  fields: [
    {
      name: 'language',
      type: 'select',
      defaultValue: 'bash',
      options: [
        { label: 'Bash/Terminal', value: 'bash' },
        { label: 'JavaScript', value: 'javascript' },
        { label: 'TypeScript', value: 'typescript' },
        { label: 'Python', value: 'python' },
        { label: 'HTML', value: 'html' },
        { label: 'CSS', value: 'css' },
        { label: 'Plain Text', value: 'plaintext' },
      ],
      admin: {
        width: '50%',
      }
    },
    {
      name: 'code',
      type: 'code', // Payload's native code editor field
      required: true,
      admin: {
        language: 'javascript', // Default syntax highlighting in admin
      }
    },
  ],
}