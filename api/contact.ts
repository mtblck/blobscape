import nodemailer from 'nodemailer'
import { checkContact } from '../src/blobscape/contact.ts'

/**
 * POST /api/contact: the Get in touch form. Emails the note to the site's
 * inbox over SMTP. Set in Vercel (Project settings, Environment Variables):
 *   SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASS, and CONTACT_TO
 *   to send somewhere other than hello@mattblack.space
 * Without them it answers 503 and the page says it couldn't send.
 *
 * Nothing is stored: the note goes straight into one email.
 */

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

// A rough brake per warm instance: a few notes a minute from one address
const recent = new Map<string, number[]>()
const WINDOW_MS = 60_000
const PER_WINDOW = 3

function tooMany(ip: string): boolean {
  const now = Date.now()
  const times = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  times.push(now)
  recent.set(ip, times)
  if (recent.size > 5000) recent.clear()
  return times.length > PER_WINDOW
}

export async function POST(request: Request): Promise<Response> {
  // Only this site's own page may post here
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  let from = ''
  try {
    from = new URL(origin ?? '').host
  } catch {
    /* "null" or missing: not our page */
  }
  if (!from || from !== host) return json(403, { error: 'forbidden' })
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return json(415, { error: 'json only' })

  const text = await request.text()
  if (text.length > 20_000) return json(413, { error: 'too long' })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json(400, { error: 'bad json' })
  }
  const checked = checkContact(body)
  if (!checked.ok) return json(400, { error: checked.error })
  // A filled honeypot is a bot: say thanks and send nothing
  if (checked.bot) return json(200, { ok: true })

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (tooMany(ip)) return json(429, { error: 'slow down' })

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CONTACT_TO = 'hello@mattblack.space' } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return json(503, { error: 'not set up' })
  const port = Number(SMTP_PORT ?? 465)
  const mail = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  const { name, email, message } = checked.note
  try {
    await mail.sendMail({
      from: { name: 'Blobscape contact form', address: SMTP_USER },
      to: CONTACT_TO,
      replyTo: email ? { name: name || email, address: email } : undefined,
      subject: `Blobscape: a note from ${name || email || 'a visitor'}`,
      text: `${message}\n\n--\nFrom: ${name || '(no name)'}\nEmail: ${email || '(none given)'}\nSent from the Get in touch page on blobscape.dev`,
    })
  } catch (e) {
    console.error('contact: send failed', e instanceof Error ? e.message : e)
    return json(502, { error: 'send failed' })
  }
  return json(200, { ok: true })
}
