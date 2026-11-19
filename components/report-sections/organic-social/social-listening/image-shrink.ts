// Browser only: a screenshot becomes two JPEGs before upload, a screen copy (1,200 px, at most 300 KB) and a print copy
// (600 px, at most 60 KB), the sizes the server checks again (spec section 8, lib/organic-social/social-listening/posts.ts).
import { MAX_IMAGE_BYTES, MAX_PRINT_BYTES } from '@/lib/organic-social/social-listening/posts'

const QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4]

async function toJpeg(bitmap: ImageBitmap, maxPx: number, maxBytes: number): Promise<Blob> {
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot resize images.')
  // A transparent screenshot gets a white background: JPEG has no transparency.
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  for (const q of QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', q))
    if (blob && blob.size <= maxBytes) return blob
  }
  throw new Error('The image is too detailed to fit the size limit. Crop it and try again.')
}

export async function shrinkScreenshot(file: File): Promise<{ bytes: Blob; print: Blob }> {
  const bitmap = await createImageBitmap(file)
  try {
    return { bytes: await toJpeg(bitmap, 1200, MAX_IMAGE_BYTES), print: await toJpeg(bitmap, 600, MAX_PRINT_BYTES) }
  } finally {
    bitmap.close()
  }
}
