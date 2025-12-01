import { CollectionConfig } from 'payload'
import { marked } from 'marked'
import { CodeBlock } from '../blocks/CodeBlock' 

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'publishedDate', 'status'],
  },
  access: {
    read: () => true, // Public can read
    // CHANGE: Allow ANY logged-in user to create/edit/delete
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    // ... (Keep all your existing fields exactly as they are) ...
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

            // 4. Config with OUR Custom Block
            const rawConfig = {
              features: [
                ...defaultEditorFeatures,
                BlocksFeature({ blocks: [CodeBlock] }),
              ]
            };

            const sanitizedConfig = await sanitizeServerEditorConfig(rawConfig, req.payload.config);

            // 5. CONVERT (The Mapping)
            const lexicalData = await convertHTMLToLexical({
              html: rawHtml,
              editorConfig: sanitizedConfig,
              JSDOM: JSDOM,
              converters: [
                // MAP <pre> TO CUSTOM 'code-block'
                ({ node }: { node: any }) => {
                  if (node.nodeName === 'PRE') {
                    const codeElement = node.querySelector('code');
                    const text = codeElement ? codeElement.textContent : node.textContent;
                    
                    let lang = 'plaintext';
                    if (codeElement && codeElement.className) {
                        const match = codeElement.className.match(/language-(\w+)/);
                        if (match) lang = match[1];
                    }

                    return {
                      type: 'block', // Lexical Block Node
                      fields: {
                        blockType: 'code-block', // Must match slug in CodeBlock.ts
                        code: text || '',
                        language: lang,
                      },
                      format: '',
                      version: 2,
                    };
                  }
                  return null;
                },
              ]
            } as any);

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