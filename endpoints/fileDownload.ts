import type { Endpoint, PayloadRequest } from 'payload'

type FileDoc = {
  url?: string | null
  filename?: string | null
  label?: string | null
  mimeType?: string | null
  filesize?: number | null
}

function filenameFromDoc(doc: FileDoc) {
  const raw =
    typeof doc.label === 'string' && doc.label.trim()
      ? doc.label.trim()
      : typeof doc.filename === 'string' && doc.filename
        ? doc.filename
        : 'download'
  return raw.replace(/[\r\n"]/g, '_')
}

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_')
  const encoded = encodeURIComponent(filename)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

export const fileDownloadEndpoint: Endpoint = {
  path: '/download/:id',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const params = req.routeParams as { id?: unknown } | undefined
    const id = typeof params?.id === 'string' ? params.id : ''
    if (!id) {
      return Response.json({ message: 'Missing file id' }, { status: 400 })
    }

    try {
      const doc = (await req.payload.findByID({
        collection: 'files',
        id,
        depth: 0,
      })) as FileDoc

      if (!doc?.url) {
        return Response.json({ message: 'File not found' }, { status: 404 })
      }

      const filename = filenameFromDoc(doc)
      const size = Number(doc.filesize) || 0
      // Keep large files off the serverless body limit — the public URL still works.
      if (size > 4.5 * 1024 * 1024) {
        return Response.redirect(doc.url, 302)
      }

      const upstream = await fetch(doc.url)
      if (!upstream.ok || !upstream.body) {
        return Response.redirect(doc.url, 302)
      }

      return new Response(upstream.body, {
        headers: {
          'Content-Type':
            doc.mimeType || upstream.headers.get('content-type') || 'application/octet-stream',
          'Content-Disposition': contentDisposition(filename),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      return Response.json({ message: 'File not found' }, { status: 404 })
    }
  },
}
