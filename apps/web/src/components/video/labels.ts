/** Call UI strings. Patient-facing text is PASHTO ONLY; staff UI is English. */
export const VIDEO_LABELS = {
  ps: {
    mute: 'غږ بند کړئ',
    unmute: 'غږ روښانه کړئ',
    cameraOff: 'کیمره بنده کړئ',
    cameraOn: 'کیمره روښانه کړئ',
    switchCamera: 'کیمره بدله کړئ',
    leave: 'مشوره پرېږدئ',
    reconnecting: 'اړیکه بیا جوړېږي…',
    connecting: 'وصل کېږي…',
    waitingForOther: 'ډاکټر ته انتظار وکړئ. ډاکټر به ډېر ژر راشي.',
    otherConnected: 'ډاکټر وصل دی',
    you: 'تاسو',
    cameraIsOff: 'کیمره بنده ده',
  },
  en: {
    mute: 'Mute',
    unmute: 'Unmute',
    cameraOff: 'Camera off',
    cameraOn: 'Camera on',
    switchCamera: 'Switch camera',
    leave: 'Leave',
    reconnecting: 'Reconnecting…',
    connecting: 'Connecting…',
    waitingForOther: 'Waiting for the patient to join…',
    otherConnected: 'Patient connected',
    you: 'You',
    cameraIsOff: 'Camera is off',
  },
} as const
export type VideoLang = keyof typeof VIDEO_LABELS
