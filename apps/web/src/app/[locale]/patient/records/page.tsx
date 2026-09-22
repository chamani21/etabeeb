'use client';

import React, { useState } from 'react';

export default function RecordsPage() {
  const [selectedCategory, setSelectedCategory] = useState('');
  
  const categories = ['CBC', 'LFT', 'RFT', 'HbA1c', 'Glucose', 'ECG', 'X-ray', 'Ultrasound', 'CT', 'MRI', 'Other'];

  const uploadedRecords = [
    { id: 1, name: 'blood_test_results.pdf', category: 'CBC', date: 'Oct 10, 2023', size: '1.2 MB' },
    { id: 2, name: 'chest_xray_scan.jpg', category: 'X-ray', date: 'Sep 15, 2023', size: '4.5 MB' }
  ];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#05201a]">Medical Records</h1>
        <p className="text-[#5D6F69] text-sm mt-1">Upload and manage your lab reports and scans</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4 mb-6">
        <h2 className="text-lg font-bold text-[#00523a] mb-4">Upload New Record</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-[#05201a] mb-1">Select Category</label>
          <select 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a] bg-white"
          >
            <option value="" disabled>Select test type...</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="border-2 border-dashed border-[#00523a]/30 rounded-xl p-8 text-center bg-[#e6fff6]/30 hover:bg-[#e6fff6] transition cursor-pointer">
          <svg className="w-10 h-10 text-[#00523a] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-[#05201a] font-medium mb-1">Tap to select or drop file</p>
          <p className="text-xs text-[#5D6F69]">Supported: PDF, JPG, PNG</p>
          <p className="text-xs text-[#ba1a1a] mt-2 font-medium">Max size: 10MB</p>
          <button className="mt-4 bg-[#00523a] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#006d4e] transition">
            Browse Files
          </button>
        </div>
      </div>

      <h2 className="text-lg font-bold text-[#00523a] mb-3">Your Files</h2>
      <div className="space-y-3">
        {uploadedRecords.map(record => (
          <div key={record.id} className="bg-white p-4 rounded-xl shadow-sm border border-[#DDE7E2] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#e6fff6] text-[#00523a] rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {record.name.endsWith('.pdf') ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  )}
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#05201a] truncate max-w-[150px]">{record.name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-bold uppercase bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{record.category}</span>
                  <span className="text-xs text-[#5D6F69]">{record.date}</span>
                </div>
              </div>
            </div>
            <button className="text-[#00523a] p-2 hover:bg-[#e6fff6] rounded-full transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
