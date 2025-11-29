import { GlobalConfig } from 'payload'

export const GlossaryImporter: GlobalConfig = {
  slug: 'glossary-importer',
  access: {
    read: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
  },
  fields: [
    {
      name: 'bulkInput',
      type: 'textarea',
      label: 'Bulk Add Terms',
      admin: {
        // We moved the instructions here to avoid the UI field errors
        description: 'Paste terms below. Format: "Term" OR "Term: Definition". One per line.',
        placeholder: 'Artificial Intelligence: A computer system...\nNeural Network\nDiffusion Model',
        rows: 20,
      },
    },
  ],
  hooks: {
    afterChange: [
      async ({ data, req }) => {
        if (!data.bulkInput) return data; // Return data if empty

        const lines = data.bulkInput.split('\n').filter((line: string) => line.trim());

        for (const line of lines) {
          const separatorIndex = line.indexOf(':');
          let term = '';
          let definitionText = '';

          if (separatorIndex > -1) {
            term = line.substring(0, separatorIndex).trim();
            definitionText = line.substring(separatorIndex + 1).trim();
          } else {
            term = line.trim();
            definitionText = 'Definition coming soon...';
          }

          if (term) {
            try {
              // FIX: We cast 'glossary-terms' to any to stop the TypeScript error
              // until your payload-types.ts are regenerated.
              await req.payload.create({
                collection: 'glossary-terms' as any, 
                data: {
                  term: term,
                  definition: {
                    root: {
                      type: 'root',
                      children: [
                        {
                          type: 'paragraph',
                          version: 1,
                          children: [
                            {
                              type: 'text',
                              text: definitionText,
                              version: 1,
                            }
                          ]
                        }
                      ],
                      direction: 'ltr',
                      format: '',
                      indent: 0,
                      version: 1,
                    }
                  }
                },
              });
            } catch (error) {
              // Log error but continue loop (e.g. duplicates)
              console.log(`Skipped duplicate or invalid term: ${term}`);
            }
          }
        }

        // Clear the input after processing
        data.bulkInput = '';
        return data;
      },
    ],
  },
}