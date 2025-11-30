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
        description: 'Paste raw markdown here. Check the box below to run.',
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

            // 3. THE FIX: Grab the EXISTING Sanitized Editor Config
            // We find the 'content' field definition from the running payload instance.
            // This config is already resolved, valid, and has all features loaded.
            const articlesCollection = req.payload.collections['articles'];
            const contentField = articlesCollection.config.fields.find((f: any) => f.name === 'content');
            
            // We cast to 'any' to access the internal 'editor' property safely
            const sanitizedEditorConfig = (contentField as any)?.editor;

            if (!sanitizedEditorConfig) {
                throw new Error('Could not find sanitized editor config on content field.');
            }

            // 4. Convert HTML -> Lexical JSON
            const lexicalData = await convertHTMLToLexical({
              html: rawHtml,
              editorConfig: sanitizedEditorConfig, // Passing the real, working config
              JSDOM: JSDOM,
            });

            // 5. Overwrite Content
            if (lexicalData && lexicalData.root) {
              data.content = lexicalData;

              // 6. CLEANUP
              data.markdownImport = null;
              data.doImport = false;

              console.log('✅ Import Success.');
            } else {
              console.error('❌ Lexical Conversion failed (Root was empty)');
            }

          } catch (error) {
            console.error('❌ IMPORT ERROR:', error);
            // We catch the error so the "Content Required" validation can fire normally
            // if the import failed.
          }
        }
        return data;
      },
    ],
  },
}

export default Articles