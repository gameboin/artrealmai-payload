// src/types/payload.d.ts

import type { PayloadRequest as BasePayloadRequest } from 'payload/types'

declare module 'payload/types' {
  interface PayloadRequest extends BasePayloadRequest {
    user:
      | ({
          collection: 'users'
          roles?: ('user' | 'admin')[]
          name?: string
          avatar?: any
        } & BasePayloadRequest['user'])
      | null
  }
}

export {}
