'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowUpRight, Menu, X } from 'lucide-react'

const links = [{ label: 'Solutions', href: '#solutions' }, { label: 'Our approach', href: '#approach' }, { label: 'Our work', href: '#our-work' }, { label: 'FAQs', href: '#faqs' }]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  return <header className="vaqor-header">
    <div className="vaqor-container flex items-center justify-between">
      <Link href="/" aria-label="Vaqor AI home" className="vaqor-wordmark">vaqor<span>ai</span><span className="vaqor-brand-dot">.</span></Link>
      <nav aria-label="Website navigation" className="hidden items-center gap-7 lg:flex">{links.map(link => <a key={link.href} href={link.href} className="vaqor-nav-link">{link.label}</a>)}</nav>
      <div className="flex items-center gap-4"><Link href="/demo" className="vaqor-button vaqor-button-small hidden sm:inline-flex">Explore demo <ArrowUpRight className="size-4" /></Link><button type="button" className="vaqor-menu-button lg:hidden" aria-label={open ? 'Close website menu' : 'Open website menu'} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>{open ? <X className="size-5" /> : <Menu className="size-5" />}</button></div>
    </div>
    {open && <nav id="mobile-navigation" aria-label="Mobile website navigation" className="vaqor-mobile-nav" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>{links.map(link => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}<ArrowUpRight className="size-4" /></a>)}<Link href="/demo" onClick={() => setOpen(false)}>Explore the live demo<ArrowUpRight className="size-4" /></Link></nav>}
  </header>
}
