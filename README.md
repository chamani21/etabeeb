# ای طبیب | eTabeeb

**Secure Telemedicine Platform for Kozhak Specialist Clinic**

Care Beyond Borders — آنلاین طبي مشوره

---

## Overview

eTabeeb is a production-ready telemedicine platform connecting patients in remote areas of Pakistan and Afghanistan with specialist doctors through video consultations, electronic prescriptions, and real-time notifications.

## Features

- 🔐 **Authentication** — Phone + password login, patient registration, role-based access
- 👤 **Patient Portal** — Mobile-first dashboard, appointments, prescriptions, medical records
- 🩺 **Doctor Portal** — Patient queue, consultation workspace, prescription builder, schedule management
- ⚙️ **Admin Portal** — Doctor management, appointment oversight, payment bypass, audit logs
- 📹 **Video Consultation** — LiveKit-based real-time video with waiting room
- 💊 **E-Prescription** — Structured medication entry, PDF generation, QR verification
- 📱 **WhatsApp Notifications** — Appointment confirmation, reminders, prescription alerts
- 📧 **Email Notifications** — Transactional emails via Resend
- 🔔 **In-App Notifications** — Bell icon with unread count
- 📋 **Clinical Records** — Vitals, allergies, conditions, investigations, follow-ups
- 📁 **Secure File Upload** — Medical reports (PDF/JPG/PNG) with MIME validation
- 🔍 **Audit Logging** — Append-only audit trail for all sensitive actions
- 🌍 **i18n** — Pashto, Urdu, Dari, English with RTL support
- 📱 **Mobile-First** — Responsive design for all screen sizes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Auth | NextAuth.js v4 (Credentials + JWT) |
| Database | PostgreSQL 16 + Drizzle ORM |
| Video | LiveKit (WebRTC) |
| WhatsApp | Meta Cloud API |
| Email | Resend |
| Deployment | Docker + Nginx + Let's Encrypt |
| Monorepo | Turborepo + npm workspaces |

## Quick Start

```bash
# Clone
git clone https://github.com/chamani21/etabeeb.git
cd etabeeb

# Install dependencies
npm install --legacy-peer-deps

# Start database
docker-compose up db -d

# Set environment
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL

# Push schema to database
npm run db:push

# Seed test data
npx tsx packages/db/seed.ts

# Start development server
npm run dev
```

## Test Accounts

| Role | Phone | Password |
|------|-------|----------|
| Admin | +920000000001 | etabeeb123 |
| Doctor | +923332357055 | etabeeb123 |
| Patient | +920000000002 | etabeeb123 |

## Project Structure

```
etabeeb/
├── apps/web/                  # Next.js application
│   ├── src/app/[locale]/
│   │   ├── patient/           # Patient portal (7 pages)
│   │   ├── doctor/            # Doctor portal (8 pages)
│   │   ├── admin/             # Admin portal (9 pages)
│   │   ├── login/             # Authentication
│   │   └── register/
│   ├── src/app/api/           # 13 API endpoints
│   ├── src/lib/               # Services (auth, notifications, audit)
│   └── public/                # Static assets
├── packages/db/               # Database schema (45 tables)
├── Dockerfile                 # Production build
├── docker-compose.yml         # PostgreSQL + Next.js + Nginx + Redis
├── nginx/                     # Reverse proxy
└── scripts/                   # Backup & deployment
```

## Environment Variables

See [.env.example](.env.example) for the complete list. Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — 64-byte random secret
- `NEXTAUTH_URL` — Canonical app URL
- `WHATSAPP_CLOUD_API_TOKEN` — Meta WhatsApp API token
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` — Video provider credentials
- `RESEND_API_KEY` — Email service key

## Deployment

```bash
# Production
docker-compose up -d

# Database backup
./scripts/backup.sh
```

## Contact

- **Clinic:** Kozhak Specialist Clinic, Chaman
- **WhatsApp:** 0333 2357055
- **Landline:** 0826 613154
- **Website:** [etabeeb.online](https://etabeeb.online)

## License

Private — Kozhak Specialist Clinic
