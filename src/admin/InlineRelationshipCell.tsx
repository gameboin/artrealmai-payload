'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

type Option = { id: string; name: string }

type Props = {
  cellData?: unknown
  collectionSlug?: string
  field?: {
    name?: string
    relationTo?: string | string[]
    hasMany?: boolean
  }
  rowData?: { id?: string }
}

const cache: Record<string, Promise<Option[]>> = {}

function idsFromCell(cellData: unknown): string[] {
  if (cellData == null || cellData === '') return []
  const list = Array.isArray(cellData) ? cellData : [cellData]
  return list
    .map((item) => {
      if (item && typeof item === 'object' && 'id' in item) return String((item as { id: unknown }).id)
      return String(item)
    })
    .filter((id) => id && id !== 'undefined' && id !== 'null')
}

function loadOptions(relationTo: string): Promise<Option[]> {
  if (!cache[relationTo]) {
    cache[relationTo] = fetch(`/api/${relationTo}?limit=200&depth=0`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`options ${res.status}`)
        return res.json()
      })
      .then((data) =>
        (Array.isArray(data?.docs) ? data.docs : []).map((doc: { id: string; name?: string }) => ({
          id: String(doc.id),
          name: String(doc.name || doc.id),
        })),
      )
      .catch((err) => {
        delete cache[relationTo]
        throw err
      })
  }
  return cache[relationTo]
}

export default function InlineRelationshipCell(props: Props) {
  const { cellData, collectionSlug, field, rowData } = props
  const relationTo = Array.isArray(field?.relationTo) ? field?.relationTo[0] : field?.relationTo
  const hasMany = Boolean(field?.hasMany)
  const fieldName = String(field?.name || '')
  const docId = String(rowData?.id || '')
  const [options, setOptions] = useState<Option[]>([])
  const [value, setValue] = useState<string[]>(() => idsFromCell(cellData))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!relationTo) return
    void loadOptions(relationTo)
      .then(setOptions)
      .catch(() => setError('Could not load list'))
  }, [relationTo])

  useEffect(() => {
    setValue(idsFromCell(cellData))
  }, [cellData])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = useMemo(
    () => options.filter((opt) => value.includes(opt.id)),
    [options, value],
  )

  const save = async (next: string[]) => {
    if (!docId || !collectionSlug || !fieldName) return
    const prev = value
    setSaving(true)
    setError('')
    setValue(next)
    try {
      const body = hasMany ? { [fieldName]: next } : { [fieldName]: next[0] || null }
      const res = await fetch(`/api/${collectionSlug}/${docId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text.slice(0, 180) || `save ${res.status}`)
      }
    } catch (err) {
      setValue(prev)
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  if (!relationTo || !docId) {
    return <span style={{ opacity: 0.6 }}>—</span>
  }

  if (!hasMany) {
    return (
      <div className="inline-rel" onMouseDown={stop} onClick={stop} onPointerDown={stop}>
        <select
          className="inline-rel-select"
          disabled={saving || options.length === 0}
          value={value[0] || ''}
          onChange={(e) => {
            void save(e.target.value ? [e.target.value] : [])
          }}
        >
          <option value="">{options.length ? '—' : 'Loading…'}</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
        {error ? <div className="inline-rel-error">{error}</div> : null}
      </div>
    )
  }

  return (
    <div className="inline-rel" ref={wrapRef} onMouseDown={stop} onClick={stop} onPointerDown={stop}>
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
          {options.length === 0 ? <div className="inline-rel-error">Loading tags…</div> : null}
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
      {error ? <div className="inline-rel-error">{error}</div> : null}
    </div>
  )
}
