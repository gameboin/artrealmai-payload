// src/types/payload.d.ts
declare module 'payload/types' {
  interface User {
    roles?: ('user' | 'admin')[];
    name?: string;
    avatar?: any;
  }
}

export {};
