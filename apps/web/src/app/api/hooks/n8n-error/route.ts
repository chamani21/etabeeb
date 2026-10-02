import { NextRequest, NextResponse } from 'next/server'
import { db } from '@etabeeb/db'
import { integrationErrors } from '@etabeeb/db/schema'
import { requireHookKey } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { n8nErrorSchema, readJson } from '@/lib/etabib/schemas'
import { sanitizeErrorText } from '@/lib/etabib/sanitize'

// POST /api/hooks/n8n-error — sanitized operational error report from an n8n Error Trigger
export async function POST(req: NextRequest) {
  try {
    requireHookKey(req)
    const parsed = n8nErrorSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const e = parsed.data
    const record = {
      source: 'n8n',
      workflowName: e.workflowName,
      workflowId: e.workflowId ?? null,
      node: e.node ?? null,
      executionId: e.executionId ?? null,
      errorMessage: sanitizeErrorText(e.errorMessage, 500),
      occurredAt: e.timestamp ?? new Date(),
    }
    const inserted = await db
      .insert(integrationErrors)
      .values(record)
      .onConflictDoNothing()
      .returning({ id: integrationErrors.id })

    // Structured, sanitized operational log line (no payloads, no secrets)
    console.error(
      `[etabib:n8n-error] workflow="${record.workflowName}" node="${record.node ?? ''}" ` +
        `execution="${record.executionId ?? ''}" message="${record.errorMessage ?? ''}"`,
    )
    return NextResponse.json({ success: true, duplicate: inserted.length === 0 })
  } catch (error) {
    return errorResponse(error, 'hooks/n8n-error')
  }
}
