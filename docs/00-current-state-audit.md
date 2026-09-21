# eTabeeb Current-State Audit
**Audit date:** 2026-09-20 · **Auditor:** Antigravity AI  
**Branch:** `feature/etabeeb-stitch-telemedicine-v1`  
**Status:** Phase 0 Discovery — READ-ONLY

---

## 1. Repository State

| Item | Finding |
|---|---|
| Repository path | `/Users/jalaluddin/etabeeb` |
| Git status | **Empty directory — fresh `git init` performed** |
| Existing commits | None (no prior history) |
| Stash / WIP | None |
| `.git` branch | `feature/etabeeb-stitch-telemedicine-v1` (created from init) |

> [!CAUTION]
> The repository root is **empty**. The live production application code is NOT present in this local working directory. The application is deployed and running at `https://etabeeb.online/etabeeb/` but its source code has not been committed to this workspace. All implementation work will build from scratch, guided by the observed live behavior and the Stitch design authority.

---

## 2. Live System Discovery

### 2.1 Live URL Analysis

| Property | Value |
|---|---|
| **Current live URL** | `https://etabeeb.online/etabeeb/` |
| **Required canonical URL** | `https://etabeeb.online/` |
| **HTML lang** | `ps` (Pashto) |
| **HTML dir** | `rtl` |
| **Page title** | ای طبیب — آنلاین طبي مشوره |
| **Framework** | React SPA (Vite build toolchain detected) |
| **Entry point** | `/etabeeb/assets/index-DfGAvbl_.js` |
| **Stylesheet** | `/etabeeb/assets/index-BqzouDn-.css` |
| **Base path** | `/etabeeb/` hardcoded |
| **PWA** | `manifest.json` present at `/etabeeb/manifest.json` |
| **Fonts** | Google Fonts CDN: Noto Naskh Arabic, Noto Sans Arabic, Inter |
| **Theme color** | `#177a6e` (differs from brand `#0B5A3A`) |
| **Favicon** | `/etabeeb/etabeeb-logo.png` |
| **Rendering** | Client-side only SPA (`<div id="root">` empty without JS) |
| **Doctors in meta** | ڈاکٹر جلال الدین، ڈاکٹر رحیم اچکزی |

### 2.2 P0 Findings (Production-Blocking)

| ID | Finding | Risk |
|---|---|---|
| P0-001 | Live site at `/etabeeb/` sub-path — canonical URL (`https://etabeeb.online/`) not met; no redirect detected | SEO, UX, bookmark-breaking |
| P0-002 | Source code not in repository — cannot audit, test, or safely modify the live system | All development risk |
| P0-003 | Fonts from Google Fonts CDN — unavailable on low-bandwidth or censored networks in Afghanistan | Clinical access risk |
| P0-004 | Pure client-side SPA — no content without JavaScript; zero SEO indexability | Discoverability |
| P0-005 | Theme color `#177a6e` does not match design system primary `#0B5A3A` | Brand integrity |

### 2.3 P1 Findings (High Priority)

| ID | Finding | Risk |
|---|---|---|
| P1-001 | TLS/HSTS status not auditable (sandbox) | Security |
| P1-002 | Security headers not auditable (sandbox) | OWASP A05 |
| P1-003 | No API endpoint mapping available | Unknown attack surface |
| P1-004 | No database schema available | Cannot assess data model safety |
| P1-005 | Backend stack not confirmed | Architecture gap |
| P1-006 | Dari/Urdu/English routes unknown | Localization gap |
| P1-007 | WhatsApp/video/payment integration unknown | Integration gap |

### 2.4 P2 Findings (Medium Priority)

| ID | Finding | Risk |
|---|---|---|
| P2-001 | `maximum-scale=5` may limit accessibility zoom | WCAG 2.2 AA |
| P2-002 | No robots.txt/sitemap.xml detected | SEO |
| P2-003 | Google Fonts `preconnect` without `dns-prefetch` fallback | Performance |

---

## 3. Stitch Design System Discovery

### 3.1 Project Identification

| Property | Value |
|---|---|
| **Project name** | Kozhak Clinic Design System |
| **Project ID** | `15674520729408700343` (immutable) |
| **Visibility** | PRIVATE |
| **Project type** | TEXT_TO_UI_PRO |
| **Device type** | DESKTOP primary |
| **User role** | OWNER |

> [!IMPORTANT]
> Authentication credentials are NOT stored anywhere. The project ID `15674520729408700343` is the only reference stored in design manifests.

### 3.2 Design System Token Summary

| Category | Key Tokens |
|---|---|
| Primary | `#004128`, brand `#0B5A3A` |
| Background | `#e8fff0` (surface), `#FFFFFF` (canvas-white) |
| Error/Caution | `#ba1a1a` (error), `#A8432F` (caution) |
| WhatsApp | `#25D366` |
| Typography RTL | Noto Naskh Arabic (body), Noto Nastaliq Urdu (display) |
| Typography LTR | Noto Serif (headlines), Inter (data/credentials) |
| Border radius | 0.5rem default, 9999px pill, 1rem lg |
| Gold accent | `#8A6F2A` (gold-ink), `#D9C58F` (gold-soft) |

### 3.3 Screen Inventory (15 total screens)

| Screen ID | Title | Role | Has HTML |
|---|---|---|---|
| `83907adf...` | etabeeb-logo.png | Asset | ✗ |
| `d25573f1...` | ویډیو مشوره (Video Consultation) | Patient App | ✓ |
| `e0ad126d...` | Extracted text (kozhakclinic.com) | Reference | ✗ |
| `be61309c...` | How It Works (د کار طریقه) | Public | ✓ |
| `a08a0ce6...` | Patient Portal (د ناروغ پورټل) | Patient App | ✓ |
| `13726596...` | Kozhak logo JPG | Asset | ✗ |
| `16422656...` | DESIGN.md | Reference | ✗ |
| `16422656...` | DESIGN_2.md | Reference | ✓ (MD) |
| `5049330f...` | Doctor Profile — ډاکټر جلال الدین | Public/App | ✓ |
| `6783539d...` | Extracted text (etabeeb.online) | Reference | ✗ |
| `688d1f67...` | eTabeeb Redesigned Platform | Public/Home | ✓ |
| `40d973ce...` | ډیجیټل طبي نسخه (E-Prescription) | App | ✓ |
| `f615456c...` | Doctor Profile Poster Modern Editorial | Print/Social | ✓ |
| `96b7c819...` | Doctor Profile Poster Kozhak | Print/Social | ✓ |
| `2bc3a37f...` | Book Appointment (نوبت واخلئ) | Patient App | ✓ |
| `c067cc40...` | Doctor portrait placeholder | Asset | ✗ |

**Actionable HTML screens: 7**  
**Critical missing screens** (not yet in Stitch): OTP/Auth, Intake form, Payment, Prescription verification QR page, Staff portal, Admin portal

---

## 4. Architecture Assessment

### 4.1 Detected Stack

| Layer | Technology | Confidence |
|---|---|---|
| Frontend | React + Vite + TypeScript (SPA) | High |
| Rendering | Client-side only | High |
| Languages | Pashto RTL primary | High |
| Fonts | Google Fonts CDN | High |
| PWA | manifest.json present | High |
| Backend | Unknown | — |
| Database | Unknown | — |
| Auth | Unknown | — |
| Video | Unknown | — |
| WhatsApp | Unknown | — |

### 4.2 Inferred Deployment

```
Browser → https://etabeeb.online
  → [Nginx or Apache]
    → /etabeeb/ → React SPA static files
    → /api/ → Backend (Node.js/Python/PHP — UNKNOWN)
```

---

## 5. Human Legal and Clinical Gates

> [!WARNING]
> These gates are **UNRESOLVED** and require written human approval before production deployment.

| Gate ID | Description |
|---|---|
| LEGAL-01 | Pakistan telemedicine licensing (PMDC/DRAP/PTA e-prescribing rules) |
| LEGAL-02 | Afghanistan cross-border prescribing (Kandahar/Spin Boldak pilot) |
| LEGAL-03 | Patient data residency and privacy (Pakistan PDPA, Afghan law) |
| LEGAL-04 | Controlled-drug e-prescribing — disabled until jurisdiction approves |
| LEGAL-05 | E-signature legal validity in Pakistan for clinical records |
| LEGAL-06 | Data retention periods per applicable health regulations |
| LEGAL-07 | WhatsApp Business healthcare messaging compliance |
| LEGAL-08 | Minor consent rules for guardian-managed bookings |
| CLINICAL-01 | Red-flag triage rule set and emergency wording (clinician approval required) |
| CLINICAL-02 | Prescription signing policy and step-up authentication |
| CLINICAL-03 | Doctor credential verification and telemedicine eligibility confirmation |
| CLINICAL-04 | AI-assist scope (draft-only, no autonomous clinical action) |

---

## 6. Existing Test Baseline

**Zero.** No tests exist; the repository was empty. All test coverage will be built from scratch per the test plan in `docs/09-test-plan-and-actual-evidence.md`.

---

## 7. Production Change Confirmation

> [!IMPORTANT]
> **No changes have been made to the live production system at `https://etabeeb.online/`.** All work is on branch `feature/etabeeb-stitch-telemedicine-v1` in an empty local repository.

---

*Generated: 2026-09-20T13:55:00+05:00 (Asia/Karachi) by Antigravity AI*
