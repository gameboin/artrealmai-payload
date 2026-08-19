import { randomBytes } from 'crypto'
import { getFieldsToSign, jwtSign, type Endpoint, type PayloadRequest } from 'payload'

function googleClientId() {
  return process.env.GOOGLE_CLIENT_ID || process.env.Google_Client_ID || ''
}

type GoogleTokenInfo = {
  aud?: string
  iss?: string
  email?: string
  email_verified?: string | boolean
  name?: string
  given_name?: string
  sub?: string
  exp?: string
}

async function verifyGoogleCredential(credential: string, clientId: string): Promise<GoogleTokenInfo> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  )
  if (!res.ok) {
    throw new Error('Google token could not be verified')
  }
  const info = (await res.json()) as GoogleTokenInfo
  const issuerOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com'
  const audienceOk = info.aud === clientId
  const verified = info.email_verified === true || info.email_verified === 'true'
  if (!issuerOk || !audienceOk || !verified || !info.email || !info.sub) {
    throw new Error('Google token is invalid for this site')
  }
  if (info.exp && Number(info.exp) * 1000 < Date.now()) {
    throw new Error('Google token has expired')
  }
  return info
}

function publicUser(user: Record<string, unknown>) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    roles: user.roles,
  }
}

const getGoogleConfig: Endpoint = {
  path: '/auth/google',
  method: 'get',
  handler: () => {
    const clientId = googleClientId()
    return Response.json({ clientId, enabled: Boolean(clientId) })
  },
}

const postGoogleAuth: Endpoint = {
  path: '/auth/google',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    const clientId = googleClientId()
    if (!clientId) {
      return Response.json({ message: 'Google sign-in is not configured yet.' }, { status: 503 })
    }

    let credential = ''
    try {
      const body = await req.json()
      credential = typeof (body as { credential?: unknown })?.credential === 'string'
        ? (body as { credential: string }).credential.trim()
        : ''
    } catch {
      return Response.json({ message: 'Invalid request body.' }, { status: 400 })
    }

    if (!credential) {
      return Response.json({ message: 'Missing Google credential.' }, { status: 400 })
    }

    try {
      const info = await verifyGoogleCredential(credential, clientId)
      const payload = req.payload
      const email = String(info.email).toLowerCase()
      const displayName = (info.name || info.given_name || email.split('@')[0] || 'Creator').trim()

      const existing = await payload.find({
        collection: 'users',
        limit: 1,
        depth: 1,
        overrideAccess: true,
        where: {
          or: [{ googleId: { equals: info.sub } }, { email: { equals: email } }],
        },
      })

      let user = existing.docs[0] as Record<string, unknown> | undefined

      if (!user) {
        user = (await payload.create({
          collection: 'users',
          overrideAccess: true,
          depth: 1,
          data: {
            email,
            name: displayName,
            googleId: info.sub,
            password: randomBytes(32).toString('hex'),
            roles: ['user'],
          },
        })) as unknown as Record<string, unknown>
      } else if (!user.googleId) {
        user = (await payload.update({
          collection: 'users',
          id: String(user.id),
          overrideAccess: true,
          depth: 1,
          data: { googleId: info.sub },
        })) as unknown as Record<string, unknown>
      }

      const collectionConfig = payload.collections.users.config
      const tokenExpiration = collectionConfig.auth.tokenExpiration
      const sid = crypto.randomUUID()
      const now = new Date()
      const expiresAt = new Date(now.getTime() + tokenExpiration * 1000)
      const currentSessions = Array.isArray(user.sessions) ? user.sessions : []
      const sessions = [
        ...currentSessions.filter((session: { expiresAt?: string | Date }) => {
          if (!session?.expiresAt) return false
          return new Date(session.expiresAt) > now
        }),
        { id: sid, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() },
      ]

      await payload.update({
        collection: 'users',
        id: String(user.id),
        overrideAccess: true,
        data: { sessions },
      })

      const fieldsToSign = getFieldsToSign({
        collectionConfig,
        email,
        sid,
        user,
      })

      const { token, exp } = await jwtSign({
        fieldsToSign,
        secret: payload.secret,
        tokenExpiration,
      })

      return Response.json({
        token,
        exp,
        user: publicUser({ ...user, email }),
        created: existing.docs.length === 0,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed'
      return Response.json({ message }, { status: 401 })
    }
  },
}

export const googleAuthEndpoints: Endpoint[] = [getGoogleConfig, postGoogleAuth]
