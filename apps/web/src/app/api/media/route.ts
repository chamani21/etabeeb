import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@etabeeb/db'
import { uploads } from '@etabeeb/db/schema'
import { eq, desc } from 'drizzle-orm'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID, createHash } from 'crypto'

const UPLOAD_DIR = '/app/private-uploads'

// GET /api/media — List user's uploaded files
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const files = await db
      .select({
        id: uploads.id,
        publicId: uploads.publicId,
        originalFilename: uploads.originalFilename,
        mimeType: uploads.mimeType,
        sizeBytes: uploads.sizeBytes,
        createdAt: uploads.createdAt,
        scanStatus: uploads.scanStatus,
      })
      .from(uploads)
      .where(eq(uploads.uploadedBy, session.user.id))
      .orderBy(desc(uploads.createdAt))
      .limit(50)

    return NextResponse.json({ files })
  } catch (error) {
    console.error('Media fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 })
  }
}

// POST /api/media — Upload a file
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > 20 * 1024 * 1024) { // 20MB limit
      return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
    }

    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf', 'text/plain',
    ]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    }

    // Sanitize filename
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const safeFilename = `${randomUUID()}.${ext}`
    const storageKey = `${session.user.id}/${safeFilename}`
    const userDir = join(UPLOAD_DIR, session.user.id)
    const filePath = join(userDir, safeFilename)

    // Create upload directory
    await mkdir(userDir, { recursive: true })

    // Write file to disk
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Compute checksum
    const checksum = createHash('sha256').update(buffer).digest('hex')

    await writeFile(filePath, buffer)

    // Save to DB
    const [record] = await db.insert(uploads).values({
      uploadedBy: session.user.id,
      storageKey,
      originalFilename: file.name.replace(/[<>:"/\\|?*]/g, '_'),
      mimeType: file.type,
      sizeBytes: file.size,
      checksum,
      scanStatus: 'clean', // In production, integrate with ClamAV or similar
    }).returning()

    return NextResponse.json({
      success: true,
      file: {
        id: record.id,
        publicId: record.publicId,
        filename: file.name,
        uploadedAt: record.createdAt,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
