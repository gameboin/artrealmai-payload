import { CollectionConfig } from 'payload'
import { marked } from 'marked'

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'publishedDate', 'status'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean((user as any)?.roles?.includes('admin')),
    update: ({ req: { user } }) => Boolean((user as any)?.roles?.includes('admin')),
    delete: ({ req: { user } }) => Boolean((user as any)?.roles?.includes('admin')),
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'markdownImport',
      type: 'textarea',
      label: 'Markdown Importer',
      admin: {
        description: 'Paste raw markdown here. The system will auto-clean wrapping tags.',
        position: 'sidebar',
        rows: 8,
      },
    },
    {
      name: 'doImport',
      type: 'checkbox',
      label: 'Run Convert on Save',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'WARNING: This overwrites existing content!',
      },
    },
    { name: 'slug', type: 'text', unique: true, required: true, index: true, admin: { position: 'sidebar' } },
    { name: 'excerpt', type: 'textarea', admin: { description: 'Short teaser for homepage' } },
    { name: 'content', type: 'richText', required: true },
    { name: 'featuredImage', type: 'upload', relationTo: 'media', required: true },
    { name: 'author', type: 'relationship', relationTo: 'authors', admin: { position: 'sidebar' } },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true, admin: { position: 'sidebar' } },
    {
      name: 'publishedDate',
      type: 'date',
      required: true,
      defaultValue: () => new Date(),
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        if (data.markdownImport && data.doImport) {
          console.log('STARTING MARKDOWN IMPORT...')

          try {
            // 1. Clean wrapped markdown (e.g. from ChatGPT)
            let cleanMarkdown = data.markdownImport.trim()
            if (cleanMarkdown.startsWith('```') && cleanMarkdown.endsWith('```')) {
              const lines = cleanMarkdown.split('\n')
              if (lines.length >= 2) {
                cleanMarkdown = lines.slice(1, -1).join('\n').trim()
              }
            }

            // 2. Markdown → HTML
            const rawHtml = await marked(cleanMarkdown)

            // 3. Lexical conversion tools
            const {
              convertHTMLToLexical,
              sanitizeServerEditorConfig,
              defaultEditorFeatures,
            } = await import('@payloadcms/richtext-lexical')
            const { JSDOM } = await import('jsdom')

            // 4. Editor config (uses your global lexical features)
            const rawConfig = {
              features: [...defaultEditorFeatures],
            }
            const sanitizedConfig = await sanitizeServerEditorConfig(rawConfig, req.payload.config)

            // 5. CONVERT — NOW WITH INLINE CODE SUPPORT
            const lexicalData = await convertHTMLToLexical({
              html: rawHtml,
              editorConfig: sanitizedConfig,
              JSDOM: JSDOM,
              converters: [
                // BLOCK CODE (your original working version)
                ({ node }: { node: any }) => {
                  if (node.nodeName === 'PRE') {
                    const codeEl = node.querySelector('code') || node
                    const text = codeEl.textContent || ''

                    let lang = 'plaintext'
                    if (codeEl.className) {
                      const match = codeEl.className.match(/language-(\w+)/)
                      if (match) lang = match[1]
                    }

                    return {
                      type: 'code',
                      language: lang,
                      children: [
                        {
                          type: 'text',
                          text,
                          format: 0,
                          detail: 0,
                          mode: 'normal',
                          style: '',
                        },
                      ],
                      format: '',
                      version: 1,
                    }
                  }
                  return null
                },

                // INLINE CODE — THIS IS THE MAGIC
                ({ node }: { node: any }) => {
                  if (node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE') {
                    return {
                      type: 'text',
                      text: node.textContent || '',
                      format: 64, // Lexical inline code format → copy button + styling
                      version: 1,
                    }
                  }
                  return null
                },
              ],
            } as any)

            // 6. Save result
            if (lexicalData?.root) {
              data.content = lexicalData
              data.markdownImport = null
              data.doImport = false
              console.log('Import Success – Inline & Block Code Ready!')
            } else {
              console.error('Conversion failed – no root node')
            }
          } catch (error) {
            console.error('IMPORT ERROR:', error)
          }
        }

        return data
      },
    ],
  },
}

export default Articles