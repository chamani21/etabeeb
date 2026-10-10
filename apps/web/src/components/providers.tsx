'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { useState, ReactNode } from 'react'

const authBasePath = `${(process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '')}/api/auth`

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <SessionProvider basePath={authBasePath}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </SessionProvider>
  )
}
