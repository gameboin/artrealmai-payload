import { CollectionConfig } from 'payload'

export const PromptStyles: CollectionConfig = {
  slug: 'prompt-styles',
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  admin: {
    useAsTitle: 'category',
    defaultColumns: ['category', 'updatedAt'],
    description: 'Manage prompt style categories. Paste multiple terms at once!',
  },
  fields: [
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Image Styles', value: 'image-styles' },
        { label: 'Subject', value: 'subject' },
        { label: 'Lighting', value: 'lighting' },
        { label: 'Camera', value: 'camera' },
        { label: 'Composition', value: 'composition' },
        { label: 'Poses', value: 'poses' },
        { label: 'Expressions', value: 'expressions' },
        { label: 'Hairstyles', value: 'hairstyles' },
        { label: 'Tops', value: 'tops' },
        { label: 'Necklines', value: 'necklines' },
        { label: 'Bottoms', value: 'bottoms' },
        { label: 'Bodysuits', value: 'bodysuits' },
        { label: 'Clothing Textures', value: 'clothing-textures' },
        { label: 'Metal Textures', value: 'metal-textures' },
        { label: 'Footwear', value: 'footwear' },
        { label: 'Accessories', value: 'accessories' },
        { label: 'Makeup', value: 'makeup' },
        { label: 'Skin Details', value: 'skin-details' },
        { label: 'Backgrounds', value: 'backgrounds' },
        { label: 'Mood & Atmosphere', value: 'mood-atmosphere' },
        { label: 'Art Movements', value: 'art-movements' },
      ],
    },
    {
      name: 'bulkTerms',
      type: 'textarea',
      label: 'Bulk Add Terms (comma-separated)',
      admin: {
        description: 'Paste multiple terms: elegant pose, sultry expression, lace bodysuit...',
        placeholder: 'elegant, dramatic, playful, seductive...',
      },
    },
    {
      name: 'terms',
      type: 'array',
      label: 'Individual Terms',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'text',
          type: 'text',
          required: true,
          admin: { placeholder: 'e.g. cyberpunk' },
        },
      ],
      admin: { initCollapsed: false },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation }: { data: any, operation: string }) => {
        // Only run if we are pasting into bulkTerms
        if ((operation === 'create' || operation === 'update') && data.bulkTerms?.trim()) {
          
          // 1. Process the NEW terms from the textbox
          const newTermsInput = data.bulkTerms
            .split(',')
            .map((t: string) => t.trim())
            .filter((t: string) => t);

          // 2. Get existing terms (if any)
          const currentTerms = data.terms || [];
          
          // 3. Create a Set of existing terms (lowercase) for easy checking
          const existingSet = new Set(currentTerms.map((row: any) => row.text.toLowerCase()));

          // 4. Filter out duplicates
          const uniqueNewTerms = newTermsInput
            .filter((text: string) => !existingSet.has(text.toLowerCase()))
            .map((text: string) => ({ text }));

          // 5. Merge
          data.terms = [...currentTerms, ...uniqueNewTerms];
          
          // 6. Cleanup
          delete data.bulkTerms;
        }
        return data;
      },
    ],
  },
}