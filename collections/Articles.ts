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
            // 1. Unwrap Markdown
            let cleanMarkdown = data.markdownImport.trim();
            if (cleanMarkdown.startsWith('```') && cleanMarkdown.endsWith('```')) {
                const lines = cleanMarkdown.split('\n');
                if (lines.length >= 2) {
                    cleanMarkdown = lines.slice(1, -1).join('\n').trim();
                }
            }

            // 2. EXTRACTION: Find code blocks and replace with placeholders
            const codeBlocks: any[] = [];
            const blockRegex = /```(\w*)\n([\s\S]*?)```/g;
            
            // FIX: Typed arguments and used _match to ignore unused variable
            const processedMarkdown = cleanMarkdown.replace(blockRegex, (_match: string, lang: string, code: string) => {
                const index = codeBlocks.length;
                codeBlocks.push({
                    lang: lang || 'plaintext',
                    code: code.trim()
                });
                return `__PAYLOAD_CODE_BLOCK_${index}__`;
            });

            // 3. Convert modified Markdown to HTML
            const rawHtml = await marked(processedMarkdown);

            // 4. Import Tools
            const { 
                convertHTMLToLexical, 
                sanitizeServerEditorConfig,
                defaultEditorFeatures,
                BlocksFeature
            } = await import('@payloadcms/richtext-lexical');
            const { JSDOM } = await import('jsdom');

            // 5. Config
            const rawConfig = {
              features: [
                ...defaultEditorFeatures,
                BlocksFeature({ blocks: [CodeBlock] }),
              ]
            };
            const sanitizedConfig = await sanitizeServerEditorConfig(rawConfig, req.payload.config);

            // 6. Convert HTML to Lexical
            const lexicalData = await convertHTMLToLexical({
              html: rawHtml,
              editorConfig: sanitizedConfig,
              JSDOM: JSDOM,
            });

            // 7. SWAP: Find placeholders and inject Custom Blocks
            if (lexicalData && lexicalData.root && lexicalData.root.children) {
                const newChildren = lexicalData.root.children.map((node: any) => {
                    if (node.type === 'paragraph' && node.children) {
                        const textContent = node.children.map((c: any) => c.text).join('');
                        const match = textContent.match(/__PAYLOAD_CODE_BLOCK_(\d+)__/);
                        
                        if (match) {
                            const index = parseInt(match[1]);
                            const blockData = codeBlocks[index];
                            
                            if (blockData) {
                                console.log(`⚡ Restoring Code Block ${index} (${blockData.lang})`);
                                return {
                                    type: 'block',
                                    fields: {
                                        blockType: 'code-block',
                                        language: blockData.lang,
                                        code: blockData.code,
                                    },
                                    format: '',
                                    version: 2,
                                };
                            }
                        }
                    }
                    return node;
                });

                lexicalData.root.children = newChildren;
                
                data.content = lexicalData;
                data.markdownImport = null;
                data.doImport = false;
                console.log('✅ Import Success (Code Blocks Restored).');
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