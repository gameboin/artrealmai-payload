'use client'

import React, { useEffect } from 'react'

function placeMenu(menu: HTMLElement) {
  const control = menu.closest('.react-select')?.querySelector('.rs__control') as HTMLElement | null
  const anchor = control || (menu.parentElement as HTMLElement | null)
  if (!anchor) return
  const r = anchor.getBoundingClientRect()
  const spaceBelow = window.innerHeight - r.bottom
  const spaceAbove = r.top
  const want = Math.min(Math.max(menu.scrollHeight, 160), 320)
  const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
  const maxH = Math.max(120, Math.min(want, (openUp ? spaceAbove : spaceBelow) - 12))
  menu.style.position = 'fixed'
  menu.style.zIndex = '10000'
  menu.style.left = `${Math.max(8, r.left)}px`
  menu.style.width = `${r.width}px`
  menu.style.maxHeight = `${maxH}px`
  menu.style.overflowY = 'auto'
  if (openUp) {
    menu.style.top = 'auto'
    menu.style.bottom = `${window.innerHeight - r.top + 4}px`
  } else {
    menu.style.bottom = 'auto'
    menu.style.top = `${r.bottom + 4}px`
  }
}

export default function KeepSelectMenusVisible({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const run = () => {
      document.querySelectorAll<HTMLElement>('.rs__menu').forEach(placeMenu)
    }
    const obs = new MutationObserver(run)
    obs.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', run)
    window.addEventListener('scroll', run, true)
    return () => {
      obs.disconnect()
      window.removeEventListener('resize', run)
      window.removeEventListener('scroll', run, true)
    }
  }, [])
  return children
}
