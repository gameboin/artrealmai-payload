'use client'

import type { DefaultCellComponentProps } from 'payload'
import React, { useEffect, useMemo, useState } from 'react'

type Option = { id: string; name: string }

const cache: Record<string, Promise<Option[]>> = {}

function idsFromCell(cellData: unknown): string[] {
  if (cellData == null || cellData === '') return []
  const list = Array.isArray(cellData) ? cellData : [cellData]
  return list
    .map((item) => {
      if (item && typeof item === 'object' && 'id' in item) return String((item as { id: unknown }).id)
      return String(item)
    })
    .filter(Boolean)
}

async function loadOptions(relationTo: string): Promise<Option[]> {
  if (!cache[relationTo]) {
    cache[relationTo] = fetch(`/api/${relationTo}?limit=200&depth=0&sort=name`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) =>
        (Array.isArray(data?.docs) ? data.docs : []).map((doc: { id: string; name?: string }) => ({
          id: String(doc.id),
          name: String(doc.name || doc.id),
        })),
      )
  }
  return cache[relationTo]
}

export default function InlineRelationshipCell(props: DefaultCellComponentProps) {
  const { cellData, collectionSlug, field, rowData } = props
  const relationTo = String((field as { relationTo?: string }).relationTo || '')
  const hasMany = Boolean((field as { hasMany?: boolean }).hasMany)
  const docId = String((rowData as { id?: string })?.id || '')
  const [options, setOptions] = useState<Option[]>([])
  const [value, setValue] = useState<string[]>(() => idsFromCell(cellData))
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = React.useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void loadOptions(relationTo).then(setOptions)
  }, [relationTo])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    setValue(idsFromCell(cellData))
  }, [cellData])

  const selected = useMemo(
    () => options.filter((opt) => value.includes(opt.id)),
    [options, value],
  )

  const save = async (next: string[]) => {
    if (!docId || !collectionSlug) return
    setSaving(true)
    setValue(next)
    try {
      const body = hasMany ? { [field.name]: next } : { [field.name]: next[0] || null }
      const res = await fetch(`/api/${collectionSlug}/${docId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setValue(idsFromCell(cellData))
    } finally {
      setSaving(false)
    }
  }

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  if (!hasMany) {
    return (
      <select
        className="inline-rel-select"
        disabled={saving}
        value={value[0] || ''}
        onMouseDown={stop}
        onClick={stop}
        onChange={(e) => {
          void save(e.target.value ? [e.target.value] : [])
        }}
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div className="inline-rel-tags" ref={wrapRef} onMouseDown={stop} onClick={stop}>
      <button
        type="button"
        className="inline-rel-tags__toggle"
        disabled={saving}
        onClick={() => setOpen((v) => !v)}
      >
        {selected.length ? selected.map((opt) => opt.name).join(', ') : 'Set tags'}
      </button>
      {open ? (
        <div className="inline-rel-tags__menu">
          {options.map((opt) => {
            const checked = value.includes(opt.id)
            return (
              <label key={opt.id} className="inline-rel-tags__option">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked ? value.filter((id) => id !== opt.id) : [...value, opt.id]
                    void save(next)
                  }}
                />
                {opt.name}
              </label>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
