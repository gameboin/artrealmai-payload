import type { PayloadRequest } from 'payload'

export async function userIsGenAdmin(req: PayloadRequest): Promise<boolean> {
  const id = req.user && typeof req.user === 'object' ? String((req.user as { id?: unknown }).id || '') : ''
  if (!id) return false
  try {
    const user = (await req.payload.findByID({
      collection: 'users',
      id,
      depth: 0,
      overrideAccess: true,
    })) as { roles?: unknown }
    return Array.isArray(user.roles) && user.roles.includes('admin')
  } catch {
    return false
  }
}
