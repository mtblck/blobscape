/**
 * A node:test reporter that says only what needs reading: each failure in full,
 * then one line of totals. `npm test` uses it and writes the usual full report
 * to verify-shots/tests.txt beside it; `npm run test:loud` prints that report.
 */
const MOST = 40 // lines of one failure's error

export default async function* quiet(source) {
  let pass = 0, skipped = 0
  const failed = []
  const started = Date.now()
  for await (const { type, data } of source) {
    if (type === 'test:pass') {
      if (data.details?.type === 'suite') continue
      if (data.skip !== undefined || data.todo !== undefined) skipped++
      else pass++
    } else if (type === 'test:fail') {
      // a parent that failed only because a test inside it did says nothing new
      if (data.details?.error?.failureType === 'subtestsFailed') continue
      const error = data.details?.error
      const text = String(error?.cause?.stack ?? error?.cause?.message ?? error?.message ?? error ?? 'failed')
      const lines = text.split('\n')
      failed.push(`FAIL ${data.name}\n  ${data.file ?? ''}${data.line ? `:${data.line}` : ''}\n${lines.slice(0, MOST).map((l) => '  ' + l).join('\n')}${lines.length > MOST ? `\n  … ${lines.length - MOST} more lines in verify-shots/tests.txt` : ''}\n\n`)
      yield failed.at(-1)
    }
  }
  const secs = Math.round((Date.now() - started) / 1000)
  const also = skipped ? `, ${skipped} skipped` : ''
  yield failed.length
    ? `${failed.length} of ${pass + failed.length} tests failed${also} (${secs} s); the full report is verify-shots/tests.txt\n`
    : `${pass} tests pass${also} (${secs} s)\n`
}
