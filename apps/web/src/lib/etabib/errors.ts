import { NextResponse } from 'next/server'
import type { ZodError } from 'zod'

/**
 * Domain error for the eTabib V1 workflow. `code` is a stable machine-readable
 * string safe to return to clients; `message` must never contain PHI/secrets.
 */
export class EtabibError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message)
    this.name = 'EtabibError'
  }
}

/** Thrown by the transition service when a status change is not permitted. */
export class TransitionError extends EtabibError {
  constructor(code: string, message: string) {
    super(code, message, 409)
    this.name = 'TransitionError'
  }
}

export function validationErrorResponse(error: ZodError) {
  // Field paths + messages only — never echo submitted values back
  return NextResponse.json(
    { error: 'Invalid input', code: 'invalid_input', details: error.flatten().fieldErrors },
    { status: 400 },
  )
}

/**
 * Map any thrown value to a safe external response. Domain errors expose their
 * code/message; everything else becomes a generic 500 and is logged server-side
 * by name/message only (no request bodies, headers or patient data).
 */
export function errorResponse(error: unknown, context: string) {
  if (error instanceof EtabibError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.httpStatus })
  }
  const err = error instanceof Error ? error : new Error(String(error))
  console.error(`[etabib:${context}] ${err.name}: ${err.message.slice(0, 300)}`)
  return NextResponse.json({ error: 'Internal error', code: 'internal_error' }, { status: 500 })
}
