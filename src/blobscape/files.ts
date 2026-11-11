/** File sizes the way people read them. */
export const kb = (bytes: number) => (bytes < 1e6 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`)

/** Saves bytes as a file on the visitor's device, through a temporary link. Nothing is uploaded. */
export function download(bytes: Uint8Array, name: string, type = 'model/gltf-binary') {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
