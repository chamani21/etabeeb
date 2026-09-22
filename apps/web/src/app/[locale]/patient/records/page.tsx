'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'

const CATEGORIES = ['Lab Results', 'CBC', 'LFT', 'RFT', 'HbA1c', 'Glucose', 'ECG', 'X-ray', 'Ultrasound', 'CT', 'MRI', 'Other']

export default function PatientRecordsPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [category, setCategory] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchRecords = async () => {
    try {
      const res = await fetch('/api/media')
      const data = await res.json()
      setRecords(data.files || [])
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRecords() }, [])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setUploadMsg('Please select a file')
      return
    }
    setUploading(true)
    setUploadMsg('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', category || 'Other')
      const res = await fetch('/api/media', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) {
        setUploadMsg(`✓ ${file.name} uploaded successfully`)
        if (fileRef.current) fileRef.current.value = ''
        setCategory('')
        await fetchRecords()
      } else {
        setUploadMsg('Error: ' + (data.error || 'Upload failed'))
      }
    } catch {
      setUploadMsg('Error: Upload failed')
    } finally {
      setUploading(false)
      setTimeout(() => setUploadMsg(''), 4000)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-[#05201a] mb-4">
        {locale === 'ps' ? 'طبي ریکارډونه' : locale === 'ur' ? 'طبی ریکارڈ' : 'Medical Records'}
      </h1>

      {/* Upload */}
      <div className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4 mb-6">
        <h2 className="text-lg font-bold text-[#00523a] mb-3">
          {locale === 'ps' ? 'نوی ریکارډ آپلوډ' : 'Upload New Record'}
        </h2>
        <form onSubmit={handleUpload} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-[#05201a] mb-1">
              {locale === 'ps' ? 'کټاګوري' : 'Category'}
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
            >
              <option value="">{locale === 'ps' ? 'غوره کړئ...' : 'Select category...'}</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#05201a] mb-1">
              {locale === 'ps' ? 'فایل' : 'File (PDF, JPG, PNG — max 20MB)'}
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none"
            />
          </div>
          {uploadMsg && (
            <div className={`text-sm px-3 py-2 rounded-lg ${uploadMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {uploadMsg}
            </div>
          )}
          <button
            type="submit"
            disabled={uploading}
            className="bg-[#00523a] text-white py-2 px-6 rounded-lg text-sm font-semibold hover:bg-[#006d4e] transition disabled:opacity-50"
          >
            {uploading ? (locale === 'ps' ? 'روان دی...' : 'Uploading...') : (locale === 'ps' ? 'آپلوډ کول' : 'Upload')}
          </button>
        </form>
      </div>

      {/* Records List */}
      {loading ? (
        <div className="text-center py-6">
          <div className="w-8 h-8 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl shadow-sm border border-[#DDE7E2]">
          <svg className="w-10 h-10 text-[#DDE7E2] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-[#5D6F69] text-sm">
            {locale === 'ps' ? 'هیڅ ریکارډ نشته' : 'No records uploaded yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(file => (
            <div key={file.id} className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#e6fff6] rounded-lg flex items-center justify-center flex-shrink-0">
                  {file.mimeType?.includes('pdf') ? (
                    <svg className="w-5 h-5 text-[#00523a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-[#00523a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-[#05201a] truncate max-w-[200px]">{file.originalFilename}</p>
                  <p className="text-xs text-[#5D6F69]">
                    {formatSize(file.sizeBytes)} · {file.createdAt ? new Date(file.createdAt).toLocaleDateString() : ''}
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                file.scanStatus === 'clean' ? 'bg-green-100 text-green-700' : 
                file.scanStatus === 'quarantined' ? 'bg-red-100 text-red-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {file.scanStatus === 'clean' ? '✓' : file.scanStatus}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
