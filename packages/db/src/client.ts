import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

let _pool: ReturnType<typeof postgres> | null = null
let _db: ReturnType<typeof drizzle> | null = null

function getPool() {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required')
    }
    _pool = postgres(process.env.DATABASE_URL, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    })
  }
  return _pool
}

function getDb() {
  if (!_db) {
    _db = drizzle(getPool(), { schema })
  }
  return _db
}

// Use a Proxy to lazily initialize the db connection on first access.
// This allows the module to be imported at build time without a DATABASE_URL.
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return (getDb() as any)[prop]
  },
})

export const pool = new Proxy({} as ReturnType<typeof postgres>, {
  get(_, prop) {
    return (getPool() as any)[prop]
  },
})
