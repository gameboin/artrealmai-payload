export function isAdmin(user: unknown): boolean {
  return Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
}

export const adminOnly = ({ req: { user } }: { req: { user: unknown } }) => isAdmin(user)

export const loggedIn = ({ req: { user } }: { req: { user: unknown } }) => Boolean(user)

/** Server endpoints with overrideAccess can still write these. REST clients cannot. */
export const systemWrite = {
  create: () => false,
  update: () => false,
} as const
