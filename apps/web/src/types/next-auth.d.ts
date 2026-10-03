import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      publicId: string
      phone: string
      displayName: string
      role: string
      locale: string
      mustChangePassword?: boolean
    } & DefaultSession['user']
  }

  interface User {
    id: string
    publicId: string
    phone: string
    displayName: string
    role: string
    locale: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    publicId: string
    phone: string
    displayName: string
    role: string
    locale: string
    sessionVersion?: number
    mustChangePassword?: boolean
    revoked?: boolean
  }
}
