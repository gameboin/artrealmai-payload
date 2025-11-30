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
    // --- IMPORT FIELD ---
    // (Removed the buggy 'ui' field here to fix the build error)
    {
      name: 'markdownImport',
      type: 'textarea',
      // The label acts as the header now
      label: '⚡ Markdown Importer', 
      admin: {
        description: 'Paste raw markdown here from your AI. Check the box below to run.',
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
    // ------------------------------
    {
      name: 'slug',
      type: 'text',
      unique: true,
      required: true,
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      admin: { description: 'Short teaser for homepage' },
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
      admin: { position: 'sidebar' },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedDate',
      type: 'date',
      required: true,
      defaultValue: () => new Date(),
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        // ONLY run if text exists AND the checkbox is ticked
        if (data.markdownImport && data.doImport) {
          console.log('🚀 STARTING MARKDOWN IMPORT...');
          
          try {
            // 1. Markdown -> HTML
            const rawHtml = await marked(data.markdownImport);

            // 2. Load Tools
            const { convertHTMLToLexical } = await import('@payloadcms/richtext-lexical');
            const { JSDOM } = await import('jsdom');
            
            // 3. HTML -> Lexical
            const lexicalData = await convertHTMLToLexical({
              html: rawHtml,
              editorConfig: req.payload.config.editor as any,
              JSDOM: JSDOM,
            });

            // 4. Overwrite Content
            if (lexicalData && lexicalData.root) {
                data.content = lexicalData;
                
                // 5. CLEANUP: Clear text and uncheck the box
                data.markdownImport = null;
                data.doImport = false; 
                
                console.log('✅ Import Success.');
            }
            
          } catch (error) {
            console.error('❌ IMPORT ERROR:', error);
          }
        }
        return data;
      },
    ],
  },
}

export default Articles