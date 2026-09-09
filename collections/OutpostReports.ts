import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { adminOnly } from '../lib/access'
import { notifyInbox } from '../lib/notify'

const REASONS = ['illegal', 'spam', 'other'] as const

export const OutpostReports: CollectionConfig = {
  slug: 'outpost-reports',
  admin: {
    useAsTitle: 'reason',
    defaultColumns: ['reason', 'pinId', 'realm', 'createdAt'],
    description: 'Public reports of Outpost pins. Review, then remove the pin if needed.',
  },
  access: {
    read: adminOnly,
    create: () => true,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const honey = typeof data.website === 'string' ? data.website.trim() : ''
        if (honey) throw new APIError('Invalid submission.', 400)
        if (typeof data.reason === 'string' && !REASONS.includes(data.reason as (typeof REASONS)[number])) {
          throw new APIError('Pick a valid reason.', 400)
        }
        return data
      },
    ],
    beforeChange: [
      ({ req, data }) => {
        if (!data) return data
        if (req.user) data.reporter = req.user.id
        return data
      },
    ],
    afterChange: [
      async ({ operation, doc }) => {
        if (operation !== 'create') return
        const row = doc as {
          reason?: string
          pinId?: string
          pinUrl?: string
          realm?: string
          note?: string
        }
        await notifyInbox({
          subject: `Outpost report: ${row.reason || 'pin'}`,
          text: [
            `Reason: ${row.reason || '—'}`,
            `Pin: ${row.pinId || '—'}`,
            `Realm: ${row.realm || '—'}`,
            `URL: ${row.pinUrl || '—'}`,
            row.note ? `Note: ${row.note}` : '',
            'Open Payload → Outpost Reports, then Remove from Outpost if needed.',
          ]
            .filter(Boolean)
            .join('\n'),
        })
      },
    ],
  },
  fields: [
    {
      name: 'reason',
      type: 'select',
      required: true,
      options: [
        { label: 'Illegal or harmful', value: 'illegal' },
        { label: 'Spam or off-topic', value: 'spam' },
        { label: 'Other', value: 'other' },
      ],
    },
    { name: 'pinId', type: 'text', required: true, index: true },
    { name: 'pinUrl', type: 'text' },
    { name: 'realm', type: 'text' },
    { name: 'kind', type: 'text' },
    { name: 'note', type: 'textarea', maxLength: 500 },
    {
      name: 'reporter',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true },
    },
    {
      name: 'website',
      type: 'text',
      maxLength: 120,
      admin: { hidden: true },
    },
  ],
}
