// src/types/payload.d.ts
import 'payload/types'

declare module 'payload/types' {
  export interface User {
    name?: string
    avatar?: { id: string; url: string }
    roles?: ('user' | 'admin')[]
  }
}
