'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ConsultationPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [status, setStatus] = useState('Waiting for doctor...');
  const [duration, setDuration] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  // Simulate doctor joining
  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus('Doctor has joined');
      setIsConnected(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Simple call timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isConnected) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isConnected]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    setStatus('Call ended');
    setIsConnected(false);
    setTimeout(() => {
      router.back();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col font-sans">
      {/* Top Header */}
      <div className="p-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent absolute top-0 left-0 right-0 z-10">
        <div>
          <h2 className="text-white font-medium text-lg">Dr. Sarah Ahmed</h2>
          <p className="text-white/70 text-sm">Cardiologist</p>
        </div>
        {isConnected && (
          <div className="bg-red-500/80 px-3 py-1 rounded-full text-white text-sm font-medium tabular-nums shadow-sm backdrop-blur-sm">
            {formatTime(duration)}
          </div>
        )}
      </div>

      {/* Main Video Area */}
      <div className="flex-1 relative bg-gray-900 flex items-center justify-center">
        {!isConnected ? (
          <div className="text-center">
            <div className="w-20 h-20 bg-gray-800 rounded-full mx-auto mb-4 flex items-center justify-center animate-pulse">
              <svg className="w-10 h-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </div>
            <p className="text-white/80 font-medium">{status}</p>
          </div>
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center relative">
            <span className="text-gray-500 text-lg">Doctor Video Stream (LiveKit Placeholder)</span>
            
            {/* Self View (PiP) */}
            {camOn && (
              <div className="absolute bottom-6 right-6 w-28 h-40 bg-gray-700 rounded-xl overflow-hidden shadow-xl border-2 border-white/10 z-20">
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center p-2">
                  Patient Cam
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-950 p-6 pb-8">
        <div className="max-w-md mx-auto flex items-center justify-center gap-6">
          <button 
            onClick={() => setMicOn(!micOn)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${micOn ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-red-500 text-white'}`}
          >
            {micOn ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
            )}
          </button>
          
          <button 
            onClick={handleEndCall}
            className="w-16 h-16 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center transition-all shadow-xl shadow-red-900/50"
          >
            <svg className="w-8 h-8 transform rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
          </button>

          <button 
            onClick={() => setCamOn(!camOn)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${camOn ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-red-500 text-white'}`}
          >
            {camOn ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
