import config from '@payload-config'
import { getFieldsToSign, getPayload, jwtSign } from 'payload'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

const ALLOWED_ORIGINS = [
  'https://artrealmai.com',
  'https://www.artrealmai.com',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:8080',
  'http://localhost:8080',
]

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin') || ''
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function json(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) })
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

export function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.Google_Client_ID || ''
  return json(request, { clientId, enabled: Boolean(clientId) })
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

export async function POST(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.Google_Client_ID || ''
  if (!clientId) {
    return json(request, { message: 'Google sign-in is not configured yet.' }, 503)
  }

  let credential = ''
  try {
    const body = await request.json()
    credential = typeof body?.credential === 'string' ? body.credential.trim() : ''
  } catch {
    return json(request, { message: 'Invalid request body.' }, 400)
  }

  if (!credential) {
    return json(request, { message: 'Missing Google credential.' }, 400)
  }

  try {
    const info = await verifyGoogleCredential(credential, clientId)
    const payload = await getPayload({ config })
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

    return json(request, {
      token,
      exp,
      user: publicUser({ ...user, email }),
      created: existing.docs.length === 0,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google sign-in failed'
    return json(request, { message }, 401)
  }
}
