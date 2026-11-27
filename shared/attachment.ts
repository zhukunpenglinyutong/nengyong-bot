/** A file the user attaches to a message, on its way from the renderer to the harness. */
export interface AttachmentFile {
  name: string
  data: Uint8Array
}

const MEDIA_TYPE_BY_EXTENSION = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['heic', 'image/heic'],
  ['mp4', 'video/mp4'],
  ['mov', 'video/quicktime'],
  ['mp3', 'audio/mpeg'],
  ['m4a', 'audio/mp4'],
  ['wav', 'audio/wav'],
])

// the image formats the model reads; other images (heic, svg…) travel as plain files
const MODEL_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

/** The media type of a picture, sound or video, undefined for any other file. */
export function mediaType(name: string): string | undefined {
  return MEDIA_TYPE_BY_EXTENSION.get(extensionOf(name))
}

/** The media type of an attachment the model sees as an image, undefined for any other file. */
export function imageType(name: string): string | undefined {
  return MODEL_IMAGE_EXTENSIONS.has(extensionOf(name)) ? mediaType(name) : undefined
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}
