/**
 * eTabeeb Notification Service
 * Centralized notification dispatcher — WhatsApp, Email, In-App
 * 
 * NEVER place WhatsApp/Email API calls directly in route handlers.
 * Always use this service.
 */

interface NotificationPayload {
  recipientUserId?: string
  recipientPhone?: string
  recipientEmail?: string
  templateKey: string
  locale?: string
  variables: Record<string, string>
  channel: 'whatsapp' | 'email' | 'sms' | 'in_app'
}

interface NotificationResult {
  success: boolean
  messageId?: string
  error?: string
}

// ============================================================
// WHATSAPP (Meta Cloud API)
// ============================================================

async function sendWhatsApp(
  phone: string,
  templateKey: string,
  variables: Record<string, string>,
  locale: string = 'ps'
): Promise<NotificationResult> {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_CLOUD_API_TOKEN
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.warn('[NotificationService] WhatsApp not configured — skipping')
    return { success: false, error: 'WhatsApp not configured' }
  }

  try {
    // Format phone: remove spaces, ensure +country code
    const formattedPhone = phone.replace(/\s+/g, '').replace(/^0/, '+92')

    const templateComponents = Object.entries(variables).map(([, value]) => ({
      type: 'text',
      text: value,
    }))

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'template',
          template: {
            name: templateKey,
            language: { code: locale === 'ps' ? 'ur' : locale }, // WhatsApp uses 'ur' for Urdu/Pashto
            components: [
              {
                type: 'body',
                parameters: templateComponents,
              },
            ],
          },
        }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('[WhatsApp] Send failed:', data)
      return { success: false, error: data.error?.message || 'WhatsApp send failed' }
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    }
  } catch (error: any) {
    console.error('[WhatsApp] Error:', error)
    return { success: false, error: error.message }
  }
}

// ============================================================
// EMAIL (Resend or SMTP)
// ============================================================

async function sendEmail(
  email: string,
  templateKey: string,
  variables: Record<string, string>,
): Promise<NotificationResult> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const SMTP_HOST = process.env.SMTP_HOST

  if (!RESEND_API_KEY && !SMTP_HOST) {
    console.warn('[NotificationService] Email not configured — skipping')
    return { success: false, error: 'Email not configured' }
  }

  try {
    if (RESEND_API_KEY) {
      // Use Resend
      const subject = getEmailSubject(templateKey, variables)
      const html = getEmailHtml(templateKey, variables)

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'eTabeeb <noreply@etabeeb.online>',
          to: email,
          subject,
          html,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.message || 'Email send failed' }
      }

      return { success: true, messageId: data.id }
    }

    // SMTP fallback would go here
    return { success: false, error: 'SMTP not implemented' }
  } catch (error: any) {
    console.error('[Email] Error:', error)
    return { success: false, error: error.message }
  }
}

// ============================================================
// IN-APP NOTIFICATIONS
// ============================================================

async function sendInApp(
  userId: string,
  templateKey: string,
  variables: Record<string, string>,
): Promise<NotificationResult> {
  try {
    const { db } = await import('@etabeeb/db')
    const { inAppNotifications } = await import('@etabeeb/db/schema')

    const { title, body } = getInAppContent(templateKey, variables)

    await db.insert(inAppNotifications).values({
      userId,
      title,
      body,
      type: templateKey,
      actionUrl: variables.actionUrl || null,
    })

    return { success: true }
  } catch (error: any) {
    console.error('[InApp] Error:', error)
    return { success: false, error: error.message }
  }
}

// ============================================================
// MAIN DISPATCHER
// ============================================================

export async function sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
  const { channel, recipientPhone, recipientEmail, recipientUserId, templateKey, variables, locale } = payload

  // Record in notification outbox for tracking
  try {
    const { db } = await import('@etabeeb/db')
    const { notificationOutbox } = await import('@etabeeb/db/schema')
    const { randomUUID } = await import('crypto')

    await db.insert(notificationOutbox).values({
      idempotencyKey: `${templateKey}_${recipientUserId || recipientPhone}_${Date.now()}`,
      channel,
      recipientUserId: recipientUserId || null,
      recipientPhone: recipientPhone || null,
      recipientEmail: recipientEmail || null,
      templateKey,
      locale: locale || 'ps',
      templateVariables: JSON.stringify(variables),
      status: 'processing',
    })
  } catch (err) {
    // Don't fail the notification if outbox write fails
    console.error('[NotificationService] Outbox write failed:', err)
  }

  // Dispatch based on channel
  switch (channel) {
    case 'whatsapp':
      if (!recipientPhone) return { success: false, error: 'No phone number' }
      return sendWhatsApp(recipientPhone, templateKey, variables, locale)

    case 'email':
      if (!recipientEmail) return { success: false, error: 'No email address' }
      return sendEmail(recipientEmail, templateKey, variables)

    case 'in_app':
      if (!recipientUserId) return { success: false, error: 'No user ID' }
      return sendInApp(recipientUserId, templateKey, variables)

    default:
      return { success: false, error: `Unknown channel: ${channel}` }
  }
}

// ============================================================
// CONVENIENCE METHODS
// ============================================================

export async function notifyAppointmentBooked(
  patientPhone: string,
  patientEmail: string | null,
  patientUserId: string,
  variables: { patientName: string; doctorName: string; appointmentDate: string; appointmentTime: string }
) {
  const results: NotificationResult[] = []

  // WhatsApp
  results.push(
    await sendNotification({
      channel: 'whatsapp',
      recipientPhone: patientPhone,
      recipientUserId: patientUserId,
      templateKey: 'appointment_confirmation',
      variables,
    })
  )

  // Email (if available)
  if (patientEmail) {
    results.push(
      await sendNotification({
        channel: 'email',
        recipientEmail: patientEmail,
        recipientUserId: patientUserId,
        templateKey: 'appointment_confirmation',
        variables,
      })
    )
  }

  // In-app
  results.push(
    await sendNotification({
      channel: 'in_app',
      recipientUserId: patientUserId,
      templateKey: 'appointment_booked',
      variables: {
        ...variables,
        actionUrl: '/patient/appointments',
      },
    })
  )

  return results
}

export async function notifyPrescriptionReady(
  patientPhone: string,
  patientEmail: string | null,
  patientUserId: string,
  variables: { patientName: string; doctorName: string }
) {
  // WhatsApp — SAFE: just says "prescription ready, sign in to view"
  await sendNotification({
    channel: 'whatsapp',
    recipientPhone: patientPhone,
    recipientUserId: patientUserId,
    templateKey: 'prescription_ready',
    variables,
  })

  // In-app
  await sendNotification({
    channel: 'in_app',
    recipientUserId: patientUserId,
    templateKey: 'prescription_ready',
    variables: {
      ...variables,
      actionUrl: '/patient/prescriptions',
    },
  })
}

export async function notifyDoctorReady(
  patientPhone: string,
  patientUserId: string,
  variables: { patientName: string; doctorName: string; joinUrl: string }
) {
  await sendNotification({
    channel: 'whatsapp',
    recipientPhone: patientPhone,
    recipientUserId: patientUserId,
    templateKey: 'doctor_ready',
    variables: {
      patientName: variables.patientName,
      doctorName: variables.doctorName,
      // Don't send join URL over WhatsApp — direct to login
    },
  })

  await sendNotification({
    channel: 'in_app',
    recipientUserId: patientUserId,
    templateKey: 'doctor_ready',
    variables: {
      ...variables,
      actionUrl: variables.joinUrl,
    },
  })
}

// ============================================================
// EMAIL TEMPLATES (simple inline for now)
// ============================================================

function getEmailSubject(templateKey: string, vars: Record<string, string>): string {
  const subjects: Record<string, string> = {
    appointment_confirmation: `ای طبیب — نوبت تأیید شوه | Appointment Confirmed`,
    appointment_reminder: `ای طبیب — د نوبت یادونه | Appointment Reminder`,
    prescription_ready: `ای طبیب — نسخه چمتو ده | Prescription Ready`,
    doctor_ready: `ای طبیب — ډاکټر آماده دی | Doctor is Ready`,
    welcome: `ای طبیب ته ښه راغلاست | Welcome to eTabeeb`,
    password_reset: `ای طبیب — پاسورډ بدلول | Password Reset`,
  }
  return subjects[templateKey] || 'eTabeeb Notification'
}

function getEmailHtml(templateKey: string, vars: Record<string, string>): string {
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ps">
    <head><meta charset="utf-8"></head>
    <body style="font-family: 'Noto Naskh Arabic', Arial, sans-serif; background: #e6fff6; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #00523a; font-size: 24px;">ای طبیب</h1>
          <p style="color: #5D6F69; font-size: 14px;">Care Beyond Borders</p>
        </div>
        <div style="color: #05201a; font-size: 16px; line-height: 1.8;">
          ${getEmailBody(templateKey, vars)}
        </div>
        <hr style="border: none; border-top: 1px solid #DDE7E2; margin: 24px 0;">
        <p style="color: #5D6F69; font-size: 12px; text-align: center;">
          کوژک اسپیشلسٹ کلینک | Kozhak Specialist Clinic<br>
          WhatsApp: 0333 2357055 | etabeeb.online
        </p>
      </div>
    </body>
    </html>
  `
}

function getEmailBody(templateKey: string, vars: Record<string, string>): string {
  switch (templateKey) {
    case 'appointment_confirmation':
      return `<p>محترم ${vars.patientName}،</p>
        <p>ستاسو نوبت د <strong>${vars.doctorName}</strong> سره تأیید شوه.</p>
        <p>📅 ${vars.appointmentDate} — ⏰ ${vars.appointmentTime}</p>
        <p>مهرباني وکړئ د خپل نوبت وخت نه مخکې <a href="https://etabeeb.online/login" style="color: #006d4e;">etabeeb.online</a> ته ننوتل وکړئ.</p>`
    case 'prescription_ready':
      return `<p>محترم ${vars.patientName}،</p>
        <p>ستاسو نسخه د <strong>${vars.doctorName}</strong> لخوا چمتو شوه.</p>
        <p>مهرباني وکړئ نسخه لیدلو لپاره <a href="https://etabeeb.online/patient/prescriptions" style="color: #006d4e;">دلته کلیک وکړئ</a>.</p>`
    default:
      return `<p>You have a new notification from eTabeeb.</p>`
  }
}

function getInAppContent(templateKey: string, vars: Record<string, string>) {
  const templates: Record<string, { title: string; body: string }> = {
    appointment_booked: {
      title: 'نوبت تأیید شوه',
      body: `ستاسو نوبت د ${vars.doctorName} سره تأیید شوه — ${vars.appointmentDate}`,
    },
    prescription_ready: {
      title: 'نسخه چمتو ده',
      body: `ستاسو نسخه د ${vars.doctorName} لخوا چمتو شوه. اوس یې وګورئ.`,
    },
    doctor_ready: {
      title: 'ډاکټر آماده دی',
      body: `${vars.doctorName} ستاسو لپاره آماده دی. مشوره کې شامل شئ.`,
    },
    followup_reminder: {
      title: 'د فالو اپ یادونه',
      body: `ستاسو فالو اپ د ${vars.doctorName} سره نږدې دی.`,
    },
  }
  return templates[templateKey] || { title: 'خبرتیا', body: 'تاسو یوه نوې خبرتیا لرئ.' }
}
