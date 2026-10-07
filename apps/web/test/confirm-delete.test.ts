import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConfirmDeleteButton } from '@/components/staff/rx/ConfirmDeleteButton'

describe('ConfirmDeleteButton (two-step voice note delete)', () => {
  it('first render shows only "Delete" — no confirmation, nothing deleted', () => {
    const onConfirm = vi.fn()
    const html = renderToStaticMarkup(createElement(ConfirmDeleteButton, { onConfirm }))
    expect(html).toContain('>Delete<')
    expect(html).not.toContain('Yes, delete')
    expect(html).not.toContain('confirm-delete')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps a 44px touch target and respects disabled', () => {
    const html = renderToStaticMarkup(createElement(ConfirmDeleteButton, { onConfirm: () => {}, disabled: true }))
    expect(html).toContain('min-h-[44px]')
    expect(html).toMatch(/<button[^>]*disabled/)
  })
})
