// src/types/payload.d.ts
import 'payload'

declare module 'payload' {
  export interface User {
    role: 'user' | 'admin'
    name?: string
  }
}
