'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import styles from './public-site.module.css'

const links = [
  { href: '#how-it-works', label: 'څنګه کار کوي؟' },
  { href: '#doctor', label: 'ستاسو ډاکټر' },
  { href: '#purpose', label: 'زموږ موخه' },
  { href: '#faq', label: 'عامې پوښتنې' },
]

export function PublicNavigation() {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.mobileNav}>
      <button
        type="button"
        className={styles.menuButton}
        aria-label={open ? 'مینو وتړئ' : 'مینو پرانیزئ'}
        aria-expanded={open}
        aria-controls="public-mobile-menu"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
      </button>
      <nav
        className={styles.mobileMenu}
        id="public-mobile-menu"
        aria-label="د پاڼې برخې"
        hidden={!open}
      >
        {links.map(({ href, label }) => (
          <a href={href} key={href} onClick={() => setOpen(false)}>{label}</a>
        ))}
      </nav>
    </div>
  )
}
