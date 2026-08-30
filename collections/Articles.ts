import { CollectionConfig } from 'payload'
import { marked } from 'marked'
import { CodeBlock } from '../blocks/CodeBlock'
import { DownloadBlock } from '../blocks/DownloadBlock'
import { applySlug } from '../lib/slug'

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'publishedDate', 'status'],
    preview: (doc) =>
      typeof doc?.slug === 'string' && doc.slug
        ? `https://artrealmai.com/article/${doc.slug}`
        : null,
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
    {
      name: 'slug',
      type: 'text',
      unique: true,
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Public URL: artrealmai.com/article/this-slug. Auto-filled from the title if left blank.',
      },
    },
    { name: 'excerpt', type: 'textarea', admin: { description: 'Short teaser for homepage and the default SEO description' } },
    {
      name: 'metaTitle',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'Optional SEO title. Leave blank to use the article title.',
      },
    },
    {
      name: 'metaDescription',
      type: 'textarea',
      admin: {
        position: 'sidebar',
        description: 'Optional SEO/social description (~150–160 characters). Leave blank to use the excerpt.',
      },
    },
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
    beforeValidate: [
      ({ data }) => applySlug(data),
    ],
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

            // 2. EXTRACTION: Use a "Safe" Placeholder (Triple Brackets)
            // This prevents Markdown from trying to format it as bold/italic
            const codeBlocks: any[] = [];
            const blockRegex = /```(\w*)\n([\s\S]*?)```/g;
            
            const languageAliases: Record<string, string> = {
                bash: 'bash',
                sh: 'bash',
                shell: 'bash',
                zsh: 'bash',
                javascript: 'javascript',
                js: 'javascript',
                typescript: 'typescript',
                ts: 'typescript',
                python: 'python',
                py: 'python',
                html: 'html',
                css: 'css',
                json: 'json',
                jsonc: 'json',
                plaintext: 'plaintext',
                text: 'plaintext',
                txt: 'plaintext',
            };
            const allowedLanguages = new Set(Object.values(languageAliases));

            const processedMarkdown = cleanMarkdown.replace(blockRegex, (_match: string, lang: string, code: string) => {
                const index = codeBlocks.length;
                const rawLang = (lang || 'plaintext').toLowerCase();
                const normalizedLang = languageAliases[rawLang] || (allowedLanguages.has(rawLang) ? rawLang : 'plaintext');
                codeBlocks.push({
                    lang: normalizedLang,
                    code: code.trim()
                });
                return `[[[CODE_BLOCK_${index}]]]`; // No underscores in the ID part to be safe
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
                BlocksFeature({ blocks: [CodeBlock, DownloadBlock] }),
              ]
            };
            const sanitizedConfig = await sanitizeServerEditorConfig(rawConfig, req.payload.config);

            // 6. Convert HTML to Lexical
            const lexicalData = await convertHTMLToLexical({
              html: rawHtml,
              editorConfig: sanitizedConfig,
              JSDOM: JSDOM,
            });

            // 7. RECURSIVE SWAPPER (Finds placeholders deeply nested in lists)
            const swapPlaceholders = (nodes: any[]): any[] => {
                return nodes.map((node) => {
                    // If this node has children (like a list or paragraph), recurse first
                    if (node.children && Array.isArray(node.children)) {
                        node.children = swapPlaceholders(node.children);
                    }

                    // Check if this node is a text-containing node that holds our placeholder
                    // We look for paragraphs or generic blocks that might contain the text
                    if (node.type === 'paragraph' || node.text) {
                        // Extract text content safely
                        let textContent = '';
                        if (node.text) textContent = node.text;
                        else if (node.children) textContent = node.children.map((c: any) => c.text).join('');
                        
                        const match = textContent.match(/\[\[\[CODE_BLOCK_(\d+)\]\]\]/);
                        
                        if (match) {
                            const index = parseInt(match[1]);
                            const blockData = codeBlocks[index];
                            
                            if (blockData) {
                                console.log(`⚡ Restoring Code Block ${index} (${blockData.lang})`);
                                // REPLACE this paragraph node with our Custom Block Node
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
            };

            // 8. Run the Swapper
            if (lexicalData && lexicalData.root && lexicalData.root.children) {
                lexicalData.root.children = swapPlaceholders(lexicalData.root.children);
                
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