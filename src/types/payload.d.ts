// src/types/payload.d.ts

import type { User as BasePayloadUser } from 'payload/auth'

declare module 'payload' {
  // This extends the user object that Payload puts on req.user
  export interface AuthenticatedUser extends BasePayloadUser {
    collection: 'users'
    name?: string
    avatar?: any // or full media shape if you want strict typing
    roles?: ('user' | 'admin')[]
  }
}

// This is the critical part — it tells TypeScript what req.user looks like in access control
declare module 'payload/types' {
  interface PayloadRequest {
    user: AuthenticatedUser | null
  }
}

export {}
