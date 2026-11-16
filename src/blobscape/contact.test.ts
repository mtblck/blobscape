import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIMITS, checkContact } from './contact.ts'

test('a note needs a message', () => {
  assert.equal(checkContact({ message: '   ' }).ok, false)
  assert.equal(checkContact(null).ok, false)
  assert.equal(checkContact('hi').ok, false)
  const ok = checkContact({ message: ' Hello \r\nthere ' })
  assert.ok(ok.ok)
  if (ok.ok) assert.equal(ok.note.message, 'Hello \nthere')
})

test('name and email are one line, so they cannot add email headers', () => {
  const c = checkContact({ name: 'Ann\r\nBcc: x@y.z', email: '', message: 'hi' })
  assert.ok(c.ok)
  if (c.ok) assert.ok(!/[\r\n]/.test(c.note.name))
})

test('a bad or long email is refused; none at all is fine', () => {
  assert.equal(checkContact({ email: 'not an email', message: 'hi' }).ok, false)
  assert.equal(checkContact({ email: 'a@b.c\nBcc: d@e.f', message: 'hi' }).ok, false)
  assert.equal(checkContact({ email: `${'a'.repeat(LIMITS.email)}@b.co`, message: 'hi' }).ok, false)
  assert.ok(checkContact({ email: 'ann@example.com', message: 'hi' }).ok)
  assert.ok(checkContact({ message: 'hi' }).ok)
})

test('too long a message is refused', () => {
  assert.equal(checkContact({ message: 'x'.repeat(LIMITS.message + 1) }).ok, false)
})

test('the hidden field marks a bot', () => {
  const c = checkContact({ message: 'hi', website: 'http://spam' })
  assert.ok(c.ok && c.bot)
})
