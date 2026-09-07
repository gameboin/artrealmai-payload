import { APIError } from 'payload'

export const HANDLE_MIN = 3
export const HANDLE_MAX = 24
export const BIO_MAX = 280
export const PIN_CAP = 24

const RESERVED = new Set([
  'admin',
  'api',
  'gen',
  'u',
  'me',
  'community',
  'outpost',
  'explore',
  'creators',
  'login',
  'register',
  'account',
  'billing',
  'contact',
  'news',
  'author',
  'article',
  'glossary',
  'profile',
  'users',
  'static',
  'assets',
  'css',
  'js',
  'sitemap',
  'robots',
  'www',
  'support',
  'help',
  'about',
  'legal',
  'privacy',
  'terms',
  'studio',
  'generate',
  'wallet',
  'security',
  'settings',
  'prompt',
  'logo',
  'aspect',
])

export function normalizeHandle(raw: unknown): string | null {
  if (raw == null) return null
  const value = String(raw).trim().toLowerCase()
  if (!value) return null
  return value
}

export function assertHandle(handle: string) {
  if (!new RegExp(`^[a-z0-9][a-z0-9_]{${HANDLE_MIN - 1},${HANDLE_MAX - 1}}$`).test(handle)) {
    throw new APIError(
      `Realm must be ${HANDLE_MIN}–${HANDLE_MAX} characters: letters, numbers, and underscores, starting with a letter or number.`,
      400,
    )
  }
  if (RESERVED.has(handle)) {
    throw new APIError('That realm is reserved.', 400)
  }
}

export function clipBio(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().slice(0, BIO_MAX)
}

export function avatarUrlOf(avatar: unknown): string | undefined {
  if (avatar && typeof avatar === 'object' && 'url' in avatar) {
    const url = (avatar as { url?: unknown }).url
    return typeof url === 'string' && url ? url : undefined
  }
  return undefined
}

export function ownerIdOf(user: unknown): string {
  if (typeof user === 'string') return user
  if (user && typeof user === 'object' && 'id' in user) {
    return String((user as { id?: unknown }).id || '')
  }
  return ''
}
