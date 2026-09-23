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
      name: 'leadEnabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Show pre-header',
      admin: {
        description: 'Bar above the main menu on the homepage. Turn off and the menu sits at the top of the page.',
      },
    },
    {
      name: 'leadHeadline',
      type: 'text',
      label: 'Pre-header headline',
      defaultValue: 'AI image generator and AI video generator',
      admin: {
        description: 'First line of the pre-header. Leave blank to keep the current headline.',
        condition: (data) => data?.leadEnabled !== false,
      },
    },
    {
      name: 'leadDetail',
      type: 'textarea',
      label: 'Pre-header line',
      defaultValue: 'Create pictures and videos in the browser — text to image, text to video, and free daily gens with ArtRealmAI Gen.',
      admin: {
        description: 'Second line. Clear it to show only the headline.',
        condition: (data) => data?.leadEnabled !== false,
      },
    },
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
