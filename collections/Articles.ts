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
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    // --- THE MAGIC IMPORT FIELD ---
    {
      name: 'markdownImport',
      type: 'textarea',
      label: '⚡ Import Raw Markdown (Overwrites Content)',
      admin: {
        description: 'Paste raw markdown here. On Save, it will convert to Rich Text below.',
        position: 'sidebar',
        rows: 10,
      },
    },
    // ------------------------------
    {
      name: 'slug',
      type: 'text',
      unique: true,
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      admin: {
        description: 'Short teaser for homepage',
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'publishedDate',
      type: 'date',
      required: true,
      defaultValue: () => new Date(),
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        if (data.markdownImport) {
          try {
            // 1. Convert Markdown -> HTML
            const html = await marked(data.markdownImport);

            // 2. Import tools dynamically
            const { convertHTMLToLexical } = await import('@payloadcms/richtext-lexical');
            const { JSDOM } = await import('jsdom'); // <--- NEW IMPORT

            // 3. Convert HTML -> Lexical JSON
            const lexicalData = await convertHTMLToLexical({
              html,
              editorConfig: req.payload.config.editor as any,
              JSDOM: JSDOM, // <--- FIX: Pass the JSDOM constructor here
            });

            // 4. Overwrite content
            if (lexicalData) {
                data.content = lexicalData;
            }

            // 5. Clear import box
            data.markdownImport = null;
            
          } catch (error) {
            console.error('Markdown Import Error:', error);
          }
        }
        return data;
      },
    ],
  },
}

export default Articles