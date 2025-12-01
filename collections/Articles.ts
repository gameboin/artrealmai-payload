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
        description: 'Paste raw markdown here — inline code with single backticks works perfectly now',
        position: 'sidebar',
        rows: 12,
      },
    },
    {
      name: 'doImport',
      type: 'checkbox',
      label: 'Run Convert on Save',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'WARNING: Overwrites existing rich text content!',
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
        if (!data.markdownImport || !data.doImport) return data

        console.log('Starting Markdown → Lexical import...')

        try {
          // 1. Clean up ChatGPT-style wrapped code blocks
          let md = data.markdownImport.trim()
          if (md.startsWith('```') && md.endsWith('```')) {
            md = md.slice(3, -3).trim()
          }

          // 2. Markdown → HTML
          const html = await marked(md, { gfm: true, breaks: false })

          // 3. Lexical tools
          const {
            convertHTMLToLexical,
            sanitizeServerEditorConfig,
            defaultEditorFeatures,
          } = await import('@payloadcms/richtext-lexical')
          const { JSDOM } = await import('jsdom')

          const editorConfig = {
            features: [...defaultEditorFeatures],
          }

          const sanitizedConfig = await sanitizeServerEditorConfig(editorConfig, req.payload.config)

          // 4. THE FINAL WORKING CONVERTERS (block + inline)
          const lexicalJSON = await convertHTMLToLexical({
            html,
            editorConfig: sanitizedConfig,
            JSDOM,
            converters: [
              // BLOCK CODE (fenced ``` blocks)
              ({ node }: { node: any }) => {
                if (node.nodeName === 'PRE') {
                  const codeEl = node.querySelector('code') || node
                  const text = codeEl.textContent || ''
                  let lang = 'plaintext'
                  if (codeEl.className) {
                    const m = codeEl.className.match(/language-(\w+)/)
                    if (m) lang = m[1]
                  }
                  return {
                    type: 'code',
                    language: lang,
                    children: [{
                      type: 'text',
                      text,
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                    }],
                    format: '',
                    version: 1,
                  }
                }
                return null
              },

              // INLINE CODE — THIS IS THE ONE THAT WAS MISSING
              ({ node }: { node: any }) => {
                if (node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE') {
                  return {
                    type: 'text',
                    text: node.textContent || '',
                    format: 64,   // 64 = inline code in Lexical → copy button appears
                    version: 1,
                  }
                }
                return null
              },
            ],
          } as any)

          if (lexicalJSON?.root) {
            data.content = lexicalJSON
            data.markdownImport = null
            data.doImport = false
            console.log('Markdown import complete — inline code works!')
          } else {
            console.error('Lexical conversion returned no content')
          }
        } catch (err) {
          console.error('Markdown import failed:', err)
        }

        return data
      },
    ],
  },
}

export default Articles