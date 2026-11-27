import { strings } from '../../shared/strings'

/** A picture the user picked, already downscaled, and where the round frame sits on it. */
export interface AvatarSource {
  dataUrl: string
  width: number
  height: number
}

export interface AvatarCrop {
  zoom: number // 1: the whole shorter side; 5: a fifth of it
  centerX: number
  centerY: number
}

export interface AvatarCandidate {
  source: AvatarSource
  crop: AvatarCrop
  name: string
}

const MAX_IMAGE_MB = 25
const MAX_SOURCE_SIDE = 1024 // keeps a phone photo small enough to crop without holding the full size
const OUTPUT_SIZE = 256 // twice the largest avatar drawn in the app
export const MIN_ZOOM = 1
export const MAX_ZOOM = 5

/** The square the round frame shows, in the source's pixels. */
export function cropRect(crop: AvatarCrop, width: number, height: number) {
  const fitted = clampCrop(crop, width, height)
  const size = Math.min(width, height) / fitted.zoom
  return { x: fitted.centerX - size / 2, y: fitted.centerY - size / 2, size }
}

/** Centres the crop without zooming: the whole shorter side is shown. */
export function centeredCrop(width: number, height: number): AvatarCrop {
  return { zoom: MIN_ZOOM, centerX: width / 2, centerY: height / 2 }
}

/** Keeps the zoom in range and the crop inside the picture, after a drag or a zoom change. */
export function clampCrop(crop: AvatarCrop, width: number, height: number): AvatarCrop {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, crop.zoom))
  const half = Math.min(width, height) / zoom / 2
  return {
    zoom,
    centerX: Math.min(width - half, Math.max(half, crop.centerX)),
    centerY: Math.min(height - half, Math.max(half, crop.centerY)),
  }
}

/** Reads, decodes and downscales the chosen file; throws a reason the user can read. */
export async function readAvatarFile(file: File): Promise<AvatarCandidate> {
  const words = strings().bot.avatar.errors
  if (!file.type.startsWith('image/')) throw new Error(words.notImage)
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(words.tooLarge(MAX_IMAGE_MB))

  const dataUrl = await readAsDataUrl(file)
  const image = await loadImage(dataUrl, words.unreadable)
  const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
  const source =
    scale === 1 ? { dataUrl, width: image.naturalWidth, height: image.naturalHeight } : shrink(image, scale)
  return { source, crop: centeredCrop(source.width, source.height), name: file.name }
}

/** Draws the cropped square into a 256×256 picture for the sidebar to store. */
export async function encodeAvatar({ source, crop }: AvatarCandidate): Promise<string> {
  const words = strings().bot.avatar.errors
  const image = await loadImage(source.dataUrl, words.unreadable)
  const { x, y, size } = cropRect(crop, source.width, source.height)
  const canvas = canvasOf(OUTPUT_SIZE, OUTPUT_SIZE)
  const context = canvas.getContext('2d')
  if (!context) throw new Error(words.saveFailed)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, x, y, size, size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  return canvas.toDataURL('image/webp', 0.92)
}

function shrink(image: HTMLImageElement, scale: number): AvatarSource {
  const words = strings().bot.avatar.errors
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = canvasOf(width, height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error(words.unreadable)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return { dataUrl: canvas.toDataURL('image/webp', 0.95), width, height }
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function readAsDataUrl(file: File): Promise<string> {
  const failure = strings().bot.avatar.errors.unreadable
  const { promise, resolve, reject } = Promise.withResolvers<string>()
  const reader = new FileReader()
  reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(failure)))
  reader.onerror = () => reject(new Error(failure))
  reader.readAsDataURL(file)
  return promise
}

function loadImage(dataUrl: string, failure: string): Promise<HTMLImageElement> {
  const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>()
  const image = new Image()
  image.onload = () => (image.naturalWidth > 0 ? resolve(image) : reject(new Error(failure)))
  image.onerror = () => reject(new Error(failure))
  image.src = dataUrl
  return promise
}
