'use client';

import React, { useState } from 'react';

export default function PatientProfilePage() {
  const [formData, setFormData] = useState({
    fullName: 'John Doe',
    dob: '1985-06-15',
    sex: 'Male',
    phone: '+92 300 1234567',
    whatsapp: '+92 300 1234567',
    email: 'john.doe@example.com',
    country: 'Pakistan',
    city: 'Lahore',
    address: '123 Main St, Gulberg',
    emName: 'Jane Doe',
    emPhone: '+92 300 7654321',
    emRel: 'Spouse',
    allergies: 'Penicillin',
    chronic: 'Hypertension',
    medications: 'Amlodipine 5mg',
    smoking: 'No',
    pregnancy: 'N/A'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#05201a]">My Profile</h1>
        <p className="text-[#5D6F69] text-sm mt-1">Update your personal and medical details</p>
      </div>

      <div className="space-y-6">
        {/* Personal Info */}
        <section className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4">
          <h2 className="text-lg font-bold text-[#00523a] mb-4 border-b pb-2">Personal Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">Full Name</label>
              <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">Date of Birth</label>
                <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">Sex</label>
                <select name="sex" value={formData.sex} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]">
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">Phone</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">WhatsApp</label>
                <input type="tel" name="whatsapp" value={formData.whatsapp} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" />
              </div>
            </div>
          </div>
        </section>

        {/* Address */}
        <section className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4">
          <h2 className="text-lg font-bold text-[#00523a] mb-4 border-b pb-2">Address</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">Country</label>
                <select name="country" value={formData.country} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]">
                  <option>Pakistan</option>
                  <option>Afghanistan</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">City</label>
                <input type="text" name="city" value={formData.city} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">Detailed Address</label>
              <textarea name="address" value={formData.address} onChange={handleChange} rows={2} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]"></textarea>
            </div>
          </div>
        </section>

        {/* Emergency Contact */}
        <section className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4">
          <h2 className="text-lg font-bold text-[#00523a] mb-4 border-b pb-2">Emergency Contact</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">Name</label>
              <input type="text" name="emName" value={formData.emName} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">Phone</label>
                <input type="tel" name="emPhone" value={formData.emPhone} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">Relationship</label>
                <input type="text" name="emRel" value={formData.emRel} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" />
              </div>
            </div>
          </div>
        </section>

        {/* Medical History */}
        <section className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4">
          <h2 className="text-lg font-bold text-[#00523a] mb-4 border-b pb-2">Medical Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">Allergies</label>
              <input type="text" name="allergies" value={formData.allergies} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" placeholder="None" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">Chronic Conditions</label>
              <input type="text" name="chronic" value={formData.chronic} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" placeholder="None" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">Current Medications</label>
              <textarea name="medications" value={formData.medications} onChange={handleChange} rows={2} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" placeholder="List any current medications"></textarea>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">Smoking</label>
                <select name="smoking" value={formData.smoking} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]">
                  <option>No</option>
                  <option>Yes</option>
                  <option>Former</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">Pregnancy Status</label>
                <select name="pregnancy" value={formData.pregnancy} onChange={handleChange} className="w-full border border-[#DDE7E2] rounded-md p-2 text-sm focus:outline-none focus:border-[#00523a]" disabled={formData.sex === 'Male'}>
                  <option>N/A</option>
                  <option>Not Pregnant</option>
                  <option>Pregnant</option>
                  <option>Nursing</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <button className="w-full bg-[#00523a] text-white font-bold py-3 rounded-xl hover:bg-[#006d4e] transition shadow-sm mb-4">
          Save Profile
        </button>
      </div>
    </>
  );
}
