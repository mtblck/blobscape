import { MADE } from './blobscape/props/index.ts'
for (const m of MADE) {
  if (m.kind !== 'prop' || !m.tags.some((t) => ['tree', 'plant', 'flower'].includes(t))) continue
  const d = m.prop.doc
  const sways = (d.moves ?? []).filter((v) => v.kind === 'sway')
  const windy = sways.filter((v) => (v as { wind?: number }).wind)
  const unbonedParts = d.parts.filter((p) => !p.bone).length
  console.log(m.id.padEnd(26), 'bones', String(d.bones?.length ?? 0).padStart(3), 'parts', String(d.parts.length).padStart(3), 'loose', String(unbonedParts).padStart(3), 'sway', sways.length, 'wind', windy.length, sways.map((s) => s.bone).slice(0, 4).join(','))
}
