import { randomBytes } from 'crypto'
import { addDataAndFileToRequest, getFieldsToSign, jwtSign, type Endpoint, type PayloadRequest } from 'payload'

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

type AuthUser = {
  id: string
  email: string
  name?: string | null
  avatar?: unknown
  roles?: unknown
  googleId?: string | null
  sessions?: {
    id: string
    createdAt?: string | null
    expiresAt: string
  }[] | null
}

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
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
      await addDataAndFileToRequest(req)
      const raw = (req.data as { credential?: unknown } | undefined)?.credential
      credential = typeof raw === 'string' ? raw.trim() : ''
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

      const byGoogle = await payload.find({
        collection: 'users',
        limit: 1,
        depth: 1,
        overrideAccess: true,
        where: { googleId: { equals: info.sub } },
      })

      let user = byGoogle.docs[0] as unknown as AuthUser | undefined
      let created = false

      if (!user) {
        const byEmail = await payload.find({
          collection: 'users',
          limit: 1,
          depth: 1,
          overrideAccess: true,
          where: { email: { equals: email } },
        })
        const emailUser = byEmail.docs[0] as unknown as AuthUser | undefined

        if (emailUser?.googleId && emailUser.googleId !== info.sub) {
          return Response.json(
            { message: 'This email is already linked to another sign-in method.' },
            { status: 409 },
          )
        }

        if (emailUser) {
          // Google proved ownership of the email. Rotate the password and drop
          // old sessions so a squatted password account cannot stay signed in.
          user = (await payload.update({
            collection: 'users',
            id: emailUser.id,
            overrideAccess: true,
            depth: 1,
            data: {
              googleId: info.sub,
              password: randomBytes(32).toString('hex'),
              sessions: [],
            } as never,
          })) as unknown as AuthUser
        } else {
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
            } as never,
          })) as unknown as AuthUser
          created = true
        }
      }

      if (!user) {
        return Response.json({ message: 'Google sign-in failed' }, { status: 401 })
      }

      const collectionConfig = payload.collections.users.config
      const tokenExpiration = collectionConfig.auth.tokenExpiration
      const sid = crypto.randomUUID()
      const now = new Date()
      const expiresAt = new Date(now.getTime() + tokenExpiration * 1000)

      await payload.update({
        collection: 'users',
        id: user.id,
        overrideAccess: true,
        data: {
          sessions: [{ id: sid, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() }],
        } as never,
      })

      const fieldsToSign = getFieldsToSign({
        collectionConfig,
        email: user.email || email,
        sid,
        user: user as unknown as PayloadRequest['user'],
      })

      const { token, exp } = await jwtSign({
        fieldsToSign,
        secret: payload.secret,
        tokenExpiration,
      })

      return Response.json({
        token,
        exp,
        user: publicUser({ ...user, email: user.email || email }),
        created,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed'
      return Response.json({ message }, { status: 401 })
    }
  },
}

export const googleAuthEndpoints: Endpoint[] = [getGoogleConfig, postGoogleAuth]
