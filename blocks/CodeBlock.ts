import { Block } from 'payload'

export const CodeBlock: Block = {
  slug: 'code-block', // Unique ID
  labels: {
    singular: 'Code Box',
    plural: 'Code Boxes',
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
    },
    {
      name: 'code',
      type: 'textarea', // Textarea is safer than 'code' field for imports
      required: true,
      admin: {
        style: {
          fontFamily: 'monospace',
          backgroundColor: '#1a1b26',
          color: '#a9b1d6',
          minHeight: '150px',
        }
      }
    },
  ],
}