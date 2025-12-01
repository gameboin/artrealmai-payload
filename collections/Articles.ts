import { CollectionConfig } from 'payload'
import { marked } from 'marked'
import { Code } from '../blocks/Code' // Import your custom block

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
          console.log('🚀 STARTING MARKDOWN IMPORT...');

          try {
            // 1. Unwrap Markdown
            let cleanMarkdown = data.markdownImport.trim();
            if (cleanMarkdown.startsWith('```') && cleanMarkdown.endsWith('```')) {
                const lines = cleanMarkdown.split('\n');
                if (lines.length >= 2) {
                    cleanMarkdown = lines.slice(1, -1).join('\n').trim();
                }
            }

            // 2. Convert to HTML
            const rawHtml = await marked(cleanMarkdown);

            // 3. Import Tools
            const { 
                convertHTMLToLexical, 
                sanitizeServerEditorConfig,
                defaultEditorFeatures,
                BlocksFeature,
            } = await import('@payloadcms/richtext-lexical');
            
            const { JSDOM } = await import('jsdom');

            // 4. Config with Custom Block
            const rawConfig = {
              features: [
                ...defaultEditorFeatures,
                BlocksFeature({ blocks: [Code] }),
              ]
            };

            const sanitizedConfig = await sanitizeServerEditorConfig(rawConfig, req.payload.config);

            // 5. CONVERT (With Type Override)
            // We cast the options object to 'any' to suppress the TS error about 'converters'
            const lexicalData = await convertHTMLToLexical({
              html: rawHtml,
              editorConfig: sanitizedConfig,
              JSDOM: JSDOM,
              converters: [
                ({ node, converters, parent }) => {
                  if (node.nodeName === 'PRE') {
                    const codeElement = node.querySelector('code');
                    const codeText = codeElement ? codeElement.textContent : node.textContent;
                    
                    let language = 'plaintext';
                    if (codeElement && codeElement.className) {
                        const match = codeElement.className.match(/language-(\w+)/);
                        if (match) language = match[1];
                    }

                    // Map <pre> to our Custom Code Block
                    return {
                      type: 'block',
                      fields: {
                        blockType: 'code',
                        code: codeText || '',
                        language: language,
                      },
                      format: '',
                      version: 2,
                    };
                  }
                  return null;
                },
              ]
            } as any); // <--- THE KEY FIX IS HERE

            // 6. Save
            if (lexicalData && lexicalData.root) {
              data.content = lexicalData;
              data.markdownImport = null;
              data.doImport = false;
              console.log('✅ Import Success.');
            } else {
              console.error('❌ Conversion failed');
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