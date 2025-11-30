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

            // 2. Load Tools Dynamically
            const { 
                convertHTMLToLexical, 
                sanitizeServerEditorConfig, // <--- NEW: The sanitization tool
                // Features we need for the conversion
                ParagraphFeature,
                HeadingFeature,
                BoldFeature,
                ItalicFeature,
                UnderlineFeature,
                StrikethroughFeature,
                LinkFeature,
                BlockquoteFeature,
                OrderedListFeature,
                UnorderedListFeature,
                InlineCodeFeature,
                HorizontalRuleFeature
            } = await import('@payloadcms/richtext-lexical');
            
            const { JSDOM } = await import('jsdom');

            // 3. DEFINE RAW CONFIG
            const rawConfig = {
              features: [
                ParagraphFeature(),
                HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }),
                BoldFeature(),
                ItalicFeature(),
                UnderlineFeature(),
                StrikethroughFeature(),
                LinkFeature({}),
                BlockquoteFeature(),
                OrderedListFeature(),
                UnorderedListFeature(),
                InlineCodeFeature(),
                HorizontalRuleFeature(),
              ]
            };

            // 4. SANITIZE CONFIG (This fixes the "map of undefined" error)
            // This turns the "Feature Functions" into the "Resolved Features" the converter needs.
            const sanitizedConfig = await sanitizeServerEditorConfig(rawConfig, req.payload.config);

            // 5. HTML -> Lexical JSON
            const lexicalData = await convertHTMLToLexical({
              html: rawHtml,
              editorConfig: sanitizedConfig, // Use the sanitized version
              JSDOM: JSDOM,
            });

            // 6. Overwrite Content
            if (lexicalData && lexicalData.root) {
              data.content = lexicalData;

              // 7. CLEANUP
              data.markdownImport = null;
              data.doImport = false;

              console.log('✅ Import Success.');
            } else {
              console.error('❌ Lexical Conversion failed (Root was empty)');
            }

          } catch (error) {
            console.error('❌ IMPORT ERROR:', error);
            // NOTE: If this fails, the "content: required" validation might still fail the save.
            // This is expected behavior (you can't save an article without content).
          }
        }
        return data;
      },
    ],
  },
}

export default Articles