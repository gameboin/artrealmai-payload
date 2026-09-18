import type { GlobalConfig } from 'payload'
import { adminOnly } from '../lib/access'

export const Homepage: GlobalConfig = {
  slug: 'homepage',
  label: 'Homepage',
  access: {
    read: () => true,
    update: adminOnly,
  },
  fields: [
    {
      name: 'spotlightHeading',
      type: 'text',
      defaultValue: 'Spotlight',
      admin: {
        description: 'Heading above featured articles on the homepage. Default: Spotlight.',
      },
    },
    {
      name: 'advertisementHeading',
      type: 'text',
      defaultValue: 'Advertisement',
      admin: {
        description: 'Heading above advertisement articles. Default: Advertisement.',
      },
    },
  ],
}
