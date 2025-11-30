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
    {
      name: 'markdownImport',
      type: 'textarea',
      label: '⚡ Markdown Importer',
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
        if (data.markdownImport && data.doImport) {
          console.log('🚀 STARTING MARKDOWN IMPORT...');

          try {
            // --- 1. SMART UNWRAPPER LOGIC ---
            let cleanMarkdown = data.markdownImport.trim();
            
            // If the whole text starts with ``` and ends with ```, strip them
            if (cleanMarkdown.startsWith('```') && cleanMarkdown.endsWith('```')) {
                const lines = cleanMarkdown.split('\n');
                // Remove the first line (```markdown) and the last line (```)
                if (lines.length >= 2) {
                    cleanMarkdown = lines.slice(1, -1).join('\n').trim();
                    console.log('🧹 Detected wrapped markdown. Auto-unwrapping...');
                }
            }

            // 2. Markdown -> HTML
            const rawHtml = await marked(cleanMarkdown);

            // 3. Load Tools
            const { 
                convertHTMLToLexical, 
                sanitizeServerEditorConfig,
                defaultEditorFeatures // Use defaults to ensure Code Blocks exist
            } = await import('@payloadcms/richtext-lexical');
            
            const { JSDOM } = await import('jsdom');

            // 4. Config
            const rawConfig = {
              features: [...defaultEditorFeatures]
            };

            const sanitizedConfig = await sanitizeServerEditorConfig(rawConfig, req.payload.config);

            // 5. Convert
            const lexicalData = await convertHTMLToLexical({
              html: rawHtml,
              editorConfig: sanitizedConfig,
              JSDOM: JSDOM,
            });

            // 6. Save
            if (lexicalData && lexicalData.root) {
              data.content = lexicalData;
              data.markdownImport = null;
              data.doImport = false;
              console.log('✅ Import Success.');
            } else {
              console.error('❌ Lexical Conversion failed (Root was empty)');
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