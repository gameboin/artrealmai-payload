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
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
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
            // 1. Unwrap
            let cleanMarkdown = data.markdownImport.trim();
            if (cleanMarkdown.startsWith('```') && cleanMarkdown.endsWith('```')) {
                const lines = cleanMarkdown.split('\n');
                if (lines.length >= 2) {
                    cleanMarkdown = lines.slice(1, -1).join('\n').trim();
                }
            }

            // 2. HTML
            const rawHtml = await marked(cleanMarkdown);
            console.log('First 50 chars of HTML:', rawHtml.substring(0, 50));

            // 3. Tools
            const { 
                convertHTMLToLexical, 
                sanitizeServerEditorConfig,
                defaultEditorFeatures,
                BlocksFeature
            } = await import('@payloadcms/richtext-lexical');
            const { JSDOM } = await import('jsdom');

            // 4. Config
            const rawConfig = {
              features: [
                ...defaultEditorFeatures,
                BlocksFeature({ blocks: [CodeBlock] }),
              ]
            };

            const sanitizedConfig = await sanitizeServerEditorConfig(rawConfig, req.payload.config);

            // 5. CONVERT
            const lexicalData = await convertHTMLToLexical({
              html: rawHtml,
              editorConfig: sanitizedConfig,
              JSDOM: JSDOM,
              converters: [
                ({ node }: { node: any }) => {
                  // Log every node to check if PRE is being seen
                  // console.log('Processing node:', node.nodeName);

                  // Case-Insensitive Check for PRE tag
                  if (node.nodeName && node.nodeName.toUpperCase() === 'PRE') {
                    console.log('⚡ FOUND PRE TAG! Converting to Custom Block...');
                    
                    const codeElement = node.querySelector('code');
                    const text = codeElement ? codeElement.textContent : node.textContent;
                    
                    let lang = 'plaintext';
                    if (codeElement && codeElement.className) {
                        const match = codeElement.className.match(/language-(\w+)/);
                        if (match) lang = match[1];
                    }

                    return {
                      type: 'block', 
                      fields: {
                        blockType: 'code-block',
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