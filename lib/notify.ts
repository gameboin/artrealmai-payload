type NotifyOpts = {
  subject: string
  text: string
}

export async function notifyInbox(opts: NotifyOpts): Promise<boolean> {
  const key = process.env.RESEND_API_KEY || ''
  const to = process.env.CONTACT_INBOX || ''
  const from = process.env.MAIL_FROM || ''
  if (!key || !to || !from) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: opts.subject,
        text: opts.text,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
