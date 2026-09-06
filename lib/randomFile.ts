import { randomBytes } from 'crypto'

export function randomFileName(ext: string) {
  const safe = String(ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8) || 'bin'
  return `${randomBytes(16).toString('hex')}.${safe}`
}
