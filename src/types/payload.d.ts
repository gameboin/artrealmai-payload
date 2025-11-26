// src/types/payload.d.ts

import type { User as BaseUser } from 'payload/auth'

declare module 'payload' {
  export interface AuthenticatedUser extends BaseUser {
    collection: 'users'
    name?: string
    avatar?: {
      id: string
      url: string
      filename: string
      mimeType: string
      filesize: number
      width?: number
      height?: number
    } | null
    roles?: ('user' | 'admin')[]
  }
}

// This is the part that makes req.user.roles work in access controls
declare module 'payload/types' {
  interface PayloadRequest {
    user: AuthenticatedUser | null | null
  }
}

export {}
