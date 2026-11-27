import { type PointerEvent as ReactPointerEvent, useRef } from 'react'
import { strings } from '../../shared/strings'
import { Icon } from '../ui/Icon'
import { type AvatarCrop, type AvatarSource, centeredCrop, clampCrop, MAX_ZOOM, MIN_ZOOM } from './avatarImage'

const STAGE_SIZE = 96
const ZOOM_BUTTON_STEP = 0.5
const ZOOM_SLIDER_STEP = 0.01

interface Props {
  source: AvatarSource
  crop: AvatarCrop
  onChange: (crop: AvatarCrop) => void
}

/** The round frame the picture is cropped to: drag it to move the picture, zoom until the part wanted fills the circle. */
export function AvatarCropper({ source, crop, onChange }: Props) {
  const words = strings().bot.avatar
  const drag = useRef<{ pointerId: number; x: number; y: number; centerX: number; centerY: number } | null>(null)
  const fitted = clampCrop(crop, source.width, source.height)
  const side = Math.min(source.width, source.height) / fitted.zoom
  const scale = STAGE_SIZE / side

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      centerX: fitted.centerX,
      centerY: fitted.centerY,
    }
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    onChange(
      clampCrop(
        {
          zoom: fitted.zoom,
          centerX: state.centerX - (event.clientX - state.x) / scale,
          centerY: state.centerY - (event.clientY - state.y) / scale,
        },
        source.width,
        source.height,
      ),
    )
  }
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  const zoomTo = (zoom: number) => onChange(clampCrop({ ...fitted, zoom }, source.width, source.height))

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="img"
        aria-label={words.crop}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ width: STAGE_SIZE, height: STAGE_SIZE }}
        className="relative overflow-hidden rounded-full bg-bubble shadow-ring"
      >
        <img
          alt=""
          draggable={false}
          src={source.dataUrl}
          className="absolute top-1/2 left-1/2 max-w-none select-none"
          style={{
            width: source.width * scale,
            height: source.height * scale,
            transform: `translate(${(source.width / 2 - fitted.centerX) * scale}px, ${
              (source.height / 2 - fitted.centerY) * scale
            }px) translate(-50%, -50%)`,
          }}
        />
      </div>

      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          aria-label={words.zoomOut}
          disabled={fitted.zoom <= MIN_ZOOM}
          onClick={() => zoomTo(fitted.zoom - ZOOM_BUTTON_STEP)}
          className="grid size-7 shrink-0 place-items-center rounded-full text-soft disabled:opacity-40"
        >
          <Icon name="minimize" size={14} />
        </button>
        <input
          type="range"
          aria-label={words.zoom}
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_SLIDER_STEP}
          value={fitted.zoom}
          onChange={(event) => zoomTo(Number(event.currentTarget.value))}
          className="min-w-0 flex-1 accent-ink"
        />
        <button
          type="button"
          aria-label={words.zoomIn}
          disabled={fitted.zoom >= MAX_ZOOM}
          onClick={() => zoomTo(fitted.zoom + ZOOM_BUTTON_STEP)}
          className="grid size-7 shrink-0 place-items-center rounded-full text-soft disabled:opacity-40"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onChange(centeredCrop(source.width, source.height))}
        className="text-xs text-muted"
      >
        {words.recenter}
      </button>
    </div>
  )
}
