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
        description: 'Paste terms below. Format: "Term: Definition". One per line.',
        placeholder: 'Artificial Intelligence: A computer system...\nNeural Network\nDiffusion Model',
        rows: 20,
      },
    },
  ],
  hooks: {
    afterChange: [
      async ({ data, req }) => {
        if (!data.bulkInput) return data;

        const lines = data.bulkInput.split('\n').filter((line: string) => line.trim());

        // Process sequentially
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
              // We use 'overrideAccess: true' to ensure the import always runs as System Admin
              await req.payload.create({
                collection: 'glossary-terms' as any, 
                data: {
                  term: term,
                  definition: {
                    root: {
                      type: 'root',
                      children: [{
                        type: 'paragraph',
                        version: 1,
                        children: [{ type: 'text', text: definitionText, version: 1 }]
                      }],
                      direction: 'ltr',
                      format: '',
                      indent: 0,
                      version: 1,
                    }
                  }
                },
                overrideAccess: true 
              });
            } catch (err) {
              // FIX: Cast 'err' to 'any' so we can access .message safely
              const error = err as any;
              
              // Ignore duplicates, but log distinct errors
              if (!error.message?.includes('unique')) {
                 console.error(`Failed to import "${term}":`, error.message);
              }
            }
          }
        }

        // Clear input to signal success
        data.bulkInput = '';
        return data;
      },
    ],
  },
}