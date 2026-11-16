import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from '@etabeeb/db'
import { users, userRoles, roles } from '@etabeeb/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { normalizePhone } from './etabib/phone'
import bcryptjs from 'bcryptjs'
import type { NextAuthOptions } from 'next-auth'
import type { JWT } from 'next-auth/jwt'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        phone: { label: 'Phone', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.password) {
          return null
        }

        // Accept local formats (03…, 07…, 00…) as well as E.164
        const phone = normalizePhone(credentials.phone) ?? credentials.phone.trim()
        const userResults = await db
          .select()
          .from(users)
          .where(eq(users.phoneE164, phone))

        const user = userResults[0]
        if (!user || !user.passwordHash || !user.isActive || user.deletedAt) {
          return null
        }

        const isPasswordValid = await bcryptjs.compare(credentials.password, user.passwordHash)
        if (!isPasswordValid) {
          return null
        }

        const roleResults = await db
          .select({ name: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(and(eq(userRoles.userId, user.id), isNull(userRoles.revokedAt)))

        const role = roleResults[0]?.name || 'patient'

        return {
          id: user.id,
          publicId: user.publicId,
          phone: user.phoneE164,
          email: user.email,
          displayName: user.displayName,
          role: role,
          locale: user.preferredLocale || 'ps',
          sessionVersion: user.sessionVersion,
          mustChangePassword: user.mustChangePassword,
        } as any
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.publicId = (user as any).publicId
        token.phone = (user as any).phone
        token.displayName = (user as any).displayName || ''
        token.role = (user as any).role
        token.locale = (user as any).locale
        token.sessionVersion = (user as any).sessionVersion ?? 0
        token.mustChangePassword = Boolean((user as any).mustChangePassword)
        token.revoked = false
        return token
      }
      return refreshSessionState(token)
    },
    async session({ session, token }) {
      // Revoked (password changed/reset, account disabled): no user in the session
      if (token?.revoked) return { ...session, user: undefined } as unknown as typeof session
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.publicId = token.publicId as string
        session.user.phone = token.phone as string
        session.user.displayName = token.displayName as string
        session.user.role = token.role as string
        session.user.locale = token.locale as string
        session.user.mustChangePassword = Boolean(token.mustChangePassword)
      }
      return session
    },
  },
}

/**
 * Re-validate a JWT session against the database on every server-side session
 * read: a password change/reset bumps users.session_version (revoking older
 * tokens), a disabled account is revoked, and the forced-rotation flag is kept
 * current. Middleware (getToken) does not run this; route handlers and server
 * layouts do (getServerSession).
 */
export async function refreshSessionState(token: JWT): Promise<JWT> {
  if (!token?.id || token.revoked) return token
  const [row] = await db
    .select({
      sessionVersion: users.sessionVersion,
      mustChangePassword: users.mustChangePassword,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, token.id as string))
    .limit(1)
  const tokenVersion = typeof token.sessionVersion === 'number' ? token.sessionVersion : 0
  if (!row || !row.isActive || row.deletedAt || row.sessionVersion !== tokenVersion) {
    return { ...token, revoked: true }
  }
  return { ...token, mustChangePassword: row.mustChangePassword }
}
