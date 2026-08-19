export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function applySlug<T extends { slug?: string | null; title?: string | null; name?: string | null }>(
  data: T | undefined,
): T | undefined {
  if (!data) return data
  const source = (typeof data.slug === 'string' && data.slug.trim()) || data.title || data.name || ''
  if (source) data.slug = slugify(String(source))
  return data
}
