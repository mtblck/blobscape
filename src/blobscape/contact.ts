/** The Get in touch form's rules, shared by the page and the function that sends it (api/contact.ts). Pure and tested. */

export const LIMITS = { name: 100, email: 200, message: 4000 } as const

export interface Note {
  name: string
  email: string
  message: string
}

// One line, no control characters: these end up in an email's headers
const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()

/** A plain address: something@something.something, no spaces or brackets. */
export const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/

export type Checked = { ok: true; bot: boolean; note: Note } | { ok: false; error: string }

/** Checks a posted note; `website` is a field people never see, so only bots fill it. */
export function checkContact(body: unknown): Checked {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Nothing was sent.' }
  const b = body as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const name = oneLine(str(b.name))
  const email = oneLine(str(b.email))
  const message = str(b.message).replace(/\r\n?/g, '\n').trim()
  if (!message) return { ok: false, error: 'Write a message first.' }
  if (message.length > LIMITS.message) return { ok: false, error: `Keep it under ${LIMITS.message} characters.` }
  if (name.length > LIMITS.name) return { ok: false, error: 'That name is too long.' }
  if (email.length > LIMITS.email || (email && !EMAIL.test(email))) return { ok: false, error: 'That email address doesn’t look right.' }
  return { ok: true, bot: str(b.website).trim() !== '', note: { name, email, message } }
}
