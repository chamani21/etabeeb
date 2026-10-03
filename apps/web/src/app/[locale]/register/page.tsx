import { redirect } from 'next/navigation'

// Public self-registration is disabled in eTabib V1 (WhatsApp-first onboarding;
// staff accounts are provisioned by an administrator).
export default function RegisterPage() {
  redirect('/login')
}
