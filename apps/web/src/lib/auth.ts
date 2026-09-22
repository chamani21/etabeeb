import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from '@etabeeb/db'
import { users, userRoles, roles } from '@etabeeb/db/schema'
import { eq, and } from 'drizzle-orm'
import bcryptjs from 'bcryptjs'
import type { NextAuthOptions } from 'next-auth'

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

        const userResults = await db
          .select()
          .from(users)
          .where(eq(users.phoneE164, credentials.phone))

        const user = userResults[0]
        if (!user || !user.passwordHash) {
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
          .where(eq(userRoles.userId, user.id))

        const role = roleResults[0]?.name || 'patient'

        return {
          id: user.id,
          publicId: user.publicId,
          phone: user.phoneE164,
          email: user.email,
          displayName: user.displayName,
          role: role,
          locale: user.preferredLocale || 'ps',
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
        token.role = (user as any).role
        token.locale = (user as any).locale
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.publicId = token.publicId as string
        session.user.phone = token.phone as string
        session.user.role = token.role as string
        session.user.locale = token.locale as string
      }
      return session
    },
  },
}
