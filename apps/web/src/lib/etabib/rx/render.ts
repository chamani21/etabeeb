/**
 * eTabib V1 — prescription renderer (server-side, headless Chromium).
 *
 * Chromium is used because it shapes Pashto/Arabic script correctly (HarfBuzz,
 * bidi) and prints the same HTML to PDF, so the WhatsApp image(s) and the PDF
 * come from one template and one data source. The page is fully offline: all
 * network requests are aborted; fonts, logo and QR are embedded data URIs.
 *
 *   CHROMIUM_PATH   path to the Chromium/Chrome binary (container: /usr/bin/chromium-browser)
 */
import { readFile } from 'fs/promises'
import path from 'path'
import QRCode from 'qrcode'
import type { Browser } from 'puppeteer-core'
import type { RxDocument } from './document'
import { buildRxHtml, type TemplateAssets } from './template'

/** CSS px → image px. 794 px (A4 @96 dpi) × 1.5 = 1191 px wide images. */
export const RX_IMAGE_SCALE = 1.5
const RENDER_TIMEOUT_MS = 30_000

export interface RenderedRx {
  /** One PNG per A4 sheet, in order. */
  pages: Buffer[]
  pdf: Buffer | null
}

const ASSET_DIR = path.join(process.cwd(), 'src/lib/etabib/rx/assets')
let assetCache: Omit<TemplateAssets, 'qrDataUri'> | null = null

async function loadAssets(): Promise<Omit<TemplateAssets, 'qrDataUri'>> {
  if (assetCache) return assetCache
  const b64 = async (f: string) => (await readFile(path.join(ASSET_DIR, f))).toString('base64')
  assetCache = {
    logoDataUri: `data:image/png;base64,${await b64('etabeeb-logo.png')}`,
    naskhFontDataUri: `data:font/ttf;base64,${await b64('NotoNaskhArabic.ttf')}`,
    sansFontDataUri: `data:font/ttf;base64,${await b64('NotoSans.ttf')}`,
  }
  return assetCache
}

export function chromiumPath(): string | null {
  const configured = process.env.CHROMIUM_PATH?.trim()
  if (configured) return configured
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  return null
}

let browserPromise: Promise<Browser> | null = null
let idleTimer: NodeJS.Timeout | null = null

async function browser(): Promise<Browser> {
  const executablePath = chromiumPath()
  if (!executablePath) throw new Error('renderer_unavailable: CHROMIUM_PATH is not configured')
  if (!browserPromise) {
    const { launch } = await import('puppeteer-core')
    browserPromise = launch({
      executablePath,
      headless: true,
      // Container runs as a non-root user with no-new-privileges: the setuid sandbox is
      // unavailable. The page only ever renders our own escaped template, offline.
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none', '--disable-extensions'],
    }).catch((e) => {
      browserPromise = null
      throw e
    })
  }
  if (idleTimer) clearTimeout(idleTimer)
  // Free memory when idle (renders are rare: one per prescription)
  idleTimer = setTimeout(() => {
    const p = browserPromise
    browserPromise = null
    void p?.then((b) => b.close()).catch(() => undefined)
  }, 120_000)
  idleTimer.unref?.()
  return browserPromise
}

export async function qrDataUri(url: string): Promise<string> {
  const svg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0b2a4aff', light: '#ffffffff' } })
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

/** Render the canonical document to PNG sheets (+ PDF unless `pdf: false`). */
export async function renderRx(doc: RxDocument, opts: { pdf?: boolean } = {}): Promise<RenderedRx> {
  const assets = await loadAssets()
  const html = buildRxHtml(doc, { ...assets, qrDataUri: doc.verifyUrl ? await qrDataUri(doc.verifyUrl) : null })
  const b = await browser()
  const page = await b.newPage()
  try {
    page.setDefaultTimeout(RENDER_TIMEOUT_MS)
    await page.setRequestInterception(true)
    page.on('request', (r) => (r.url().startsWith('data:') || r.url() === 'about:blank' ? r.continue() : r.abort()))
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: RX_IMAGE_SCALE })
    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS })
    await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready.then(() => true))
    await page.waitForFunction('window.__RX_READY === true', { timeout: RENDER_TIMEOUT_MS })
    const sheets = await page.$$('.sheet')
    const pages: Buffer[] = []
    for (const s of sheets) pages.push(Buffer.from(await s.screenshot({ type: 'png', omitBackground: false })))
    const pdf = opts.pdf === false ? null : Buffer.from(await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true }))
    return { pages, pdf }
  } finally {
    await page.close().catch(() => undefined)
  }
}
