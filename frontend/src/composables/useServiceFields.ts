import type { Service } from '@/types/models'

export interface FieldSpec {
  key: string
  label: string
  type: 'input' | 'textarea' | 'select'
  required: boolean
  numeric?: boolean
  placeholder?: string
  options?: string[] | Array<{ value: string; label: string }>
  /** Web Traffic: only show for the matching type_of_traffic. */
  showWhenTraffic?: string
}

/** Service types whose order is priced/quantified by a quantity amount. */
export const QUANTITY_TYPES = [
  'Default',
  'SEO',
  'Mentions',
  'Mentions User Followers',
  'Comment Likes',
  'Poll',
  'Invites from Groups',
  'Web Traffic',
]

/** Type-specific extra fields required by the SMM provider for the service. */
export function serviceFields(service: Service | null): FieldSpec[] {
  if (!service) return []
  switch (service.type) {
    case 'Custom Comments':
    case 'Custom Comments Package':
      return [
        { key: 'comments', label: 'Comments (one per line)', type: 'textarea', required: true },
      ]
    case 'Comment Replies':
      return [
        { key: 'username', label: 'Username', type: 'input', required: true },
        { key: 'comments', label: 'Comments (one per line)', type: 'textarea', required: true },
      ]
    case 'Mentions':
      return [
        { key: 'usernames', label: 'Usernames (one per line)', type: 'textarea', required: true },
      ]
    case 'Mentions User Followers':
    case 'Comment Likes':
      return [{ key: 'username', label: 'Username', type: 'input', required: true }]
    case 'Poll':
      return [
        { key: 'answerNumber', label: 'Answer number', type: 'input', required: true, numeric: true },
      ]
    case 'SEO':
      return [
        { key: 'keywords', label: 'Keywords (one per line)', type: 'textarea', required: true },
      ]
    case 'Invites from Groups':
      return [
        { key: 'groups', label: 'Groups (one per line)', type: 'textarea', required: true },
      ]
    case 'Subscriptions':
      return [
        { key: 'username', label: 'Username', type: 'input', required: true },
        { key: 'min', label: 'Min quantity', type: 'input', required: true, numeric: true },
        { key: 'max', label: 'Max quantity', type: 'input', required: true, numeric: true },
        {
          key: 'delay',
          label: 'Delay (minutes)',
          type: 'select',
          required: true,
          options: ['0', '5', '10', '15', '20', '30', '40', '50', '60', '90', '120', '150', '180', '210', '240', '270', '300', '360', '420', '480', '540', '600'],
        },
      ]
    case 'Web Traffic':
      return [
        { key: 'country', label: 'Country (e.g. "US" or "United States")', type: 'input', required: true },
        {
          key: 'device',
          label: 'Device',
          type: 'select',
          required: true,
          options: [
            { value: '1', label: 'Desktop' },
            { value: '2', label: 'Mobile (Android)' },
            { value: '3', label: 'Mobile (iOS)' },
            { value: '4', label: 'Mixed (Mobile)' },
            { value: '5', label: 'Mixed (Mobile & Desktop)' },
          ],
        },
        {
          key: 'typeOfTraffic',
          label: 'Type of traffic',
          type: 'select',
          required: true,
          options: [
            { value: '1', label: 'Google Keyword' },
            { value: '2', label: 'Custom Referrer' },
            { value: '3', label: 'Blank Referrer' },
          ],
        },
        { key: 'googleKeyword', label: 'Google keyword', type: 'input', required: true, showWhenTraffic: '1' },
        { key: 'referringUrl', label: 'Referring URL', type: 'input', required: true, showWhenTraffic: '2' },
      ]
    default:
      return []
  }
}
