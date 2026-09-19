/**
 * Prompt-optimizer packs for DeepSeek V4.1 Flash.
 *
 * Cache: system message MUST be systemPackFor(target) with no extra
 * prefix (no user id, date, or second pack). Token 0 is always CORE_PACK.
 * User-specific text belongs only in buildOptimizeUserText().
 */
import { CORE_PACK } from './core'
import { FLUX3_VIDEO_PACK } from './flux-3-video'
import { IMAGINE_VIDEO_PACK } from './imagine-video'
import { MINIMAX_H3_PACK } from './minimax-h3'
import { NL_IMAGE_PACK } from './nl-image'
import { SEEDANCE_PACK } from './seedance'

export { CORE_PACK } from './core'
export { FLUX3_VIDEO_PACK } from './flux-3-video'
export { IMAGINE_VIDEO_PACK } from './imagine-video'
export { MINIMAX_H3_PACK } from './minimax-h3'
export { NL_IMAGE_PACK } from './nl-image'
export { SEEDANCE_PACK } from './seedance'

export const PROMPT_TARGETS = [
  'nl-image',
  'minimax-h3',
  'seedance',
  'flux-3-video',
  'imagine-video',
] as const
export type PromptTarget = (typeof PROMPT_TARGETS)[number]

const FAMILY: Record<PromptTarget, string> = {
  'imagine-video': IMAGINE_VIDEO_PACK,
  'minimax-h3': MINIMAX_H3_PACK,
  'nl-image': NL_IMAGE_PACK,
  seedance: SEEDANCE_PACK,
  'flux-3-video': FLUX3_VIDEO_PACK,
}

/** Frozen join between core and family. Changing this byte busts every cache. */
const SYSTEM_JOIN = '\n\n'

export const H3_MODES = ['T2VA', 'I2VA', 'FL2VA', 'L2VA'] as const
export type H3Mode = (typeof H3_MODES)[number]
export const IMAGINE_MODES = ['t2v', 'i2v', 'ref2v'] as const
export type ImagineMode = (typeof IMAGINE_MODES)[number]
export const SEEDANCE_MODES = ['t2v', 'i2v', 'fl2v', 'ref2v'] as const
export type SeedanceMode = (typeof SEEDANCE_MODES)[number]
export const FLUX3_MODES = ['t2v', 'i2v', 'v2v'] as const
export type Flux3Mode = (typeof FLUX3_MODES)[number]
export const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '2:1'] as const

export function isPromptTarget(value: unknown): value is PromptTarget {
  return PROMPT_TARGETS.includes(value as PromptTarget)
}

export function isH3Mode(value: unknown): value is H3Mode {
  return H3_MODES.includes(value as H3Mode)
}

export function isImagineMode(value: unknown): value is ImagineMode {
  return IMAGINE_MODES.includes(value as ImagineMode)
}

export function isSeedanceMode(value: unknown): value is SeedanceMode {
  return SEEDANCE_MODES.includes(value as SeedanceMode)
}

export function isFlux3Mode(value: unknown): value is Flux3Mode {
  return FLUX3_MODES.includes(value as Flux3Mode)
}

/** Exact system string to send. CORE first, then one family pack. */
export function systemPackFor(target: PromptTarget) {
  return CORE_PACK + SYSTEM_JOIN + FAMILY[target]
}

function durationSecOf(value: unknown, fallback = 6, max = 20) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(max, Math.max(1, Math.round(n)))
}

function aspectOf(value: unknown, fallback: string) {
  const a = String(value || '').trim()
  return (ASPECTS as readonly string[]).includes(a) ? a : fallback
}

export function buildOptimizeUserText(
  target: PromptTarget,
  opts: {
    brief: string
    mode?: string
    durationSec?: number
    aspect?: string
    refNotes?: string
    hasImage?: boolean
  },
) {
  const brief = String(opts.brief || '').trim()
  const refsIn = String(opts.refNotes || '').trim()

  if (target === 'minimax-h3') {
    const mode = isH3Mode(opts.mode) ? opts.mode : opts.hasImage ? 'I2VA' : 'T2VA'
    const refs = refsIn || (opts.hasImage
      ? (mode === 'L2VA'
        ? 'Picture 1 is the last frame (image attached).'
        : mode === 'FL2VA'
          ? 'Picture 1 is the first frame (image attached). Picture 2 / last frame is described in the brief.'
          : 'Picture 1 is the first frame (image attached).')
      : 'No reference pictures.')
    return `Mode: ${mode}\nDuration: ${durationSecOf(opts.durationSec, 6, 15)}s\nReference notes: ${refs}\n\nBrief:\n${brief}`
  }

  if (target === 'imagine-video') {
    const mode = isImagineMode(opts.mode) ? opts.mode : opts.hasImage ? 'i2v' : 't2v'
    const refs = refsIn || (opts.hasImage
      ? 'First-frame image attached. Do not re-describe the still. Motion and sound only.'
      : 'No reference pictures.')
    return `Mode: ${mode}\nDuration: ${durationSecOf(opts.durationSec, 6, 15)}s\nAspect: ${aspectOf(opts.aspect, '16:9')}\nReference notes: ${refs}\n\nBrief:\n${brief}`
  }

  if (target === 'seedance') {
    const mode = isSeedanceMode(opts.mode) ? opts.mode : opts.hasImage ? 'i2v' : 't2v'
    const refs = refsIn || (opts.hasImage
      ? (mode === 'fl2v'
        ? '@Image 1 is the first frame. @Image 2 is the last frame if attached; otherwise last frame is in the brief.'
        : '@Image 1 is attached. Give it an explicit job (first frame, identity, location, or product).')
      : 'No reference files.')
    return `Mode: ${mode}\nDuration: ${durationSecOf(opts.durationSec, 8, 15)}s\nAspect: ${aspectOf(opts.aspect, '16:9')}\nReference notes: ${refs}\n\nBrief:\n${brief}`
  }

  if (target === 'flux-3-video') {
    const mode = isFlux3Mode(opts.mode) ? opts.mode : opts.hasImage ? 'i2v' : 't2v'
    const refs = refsIn || (opts.hasImage
      ? (mode === 'v2v'
        ? 'Start video attached. Continue from the last frames. Prompt is what happens next.'
        : 'Keyframe image(s) attached. One image = start frame. Two = start and end. Prompt is the motion between pins.')
      : 'No keyframes. Text-to-video.')
    return `Mode: ${mode}\nDuration: ${durationSecOf(opts.durationSec, 8, 20)}s\nAspect: ${aspectOf(opts.aspect, '16:9')}\nReference notes: ${refs}\n\nBrief:\n${brief}`
  }

  const mode = opts.hasImage ? 'i2i' : 't2i'
  const refs = refsIn || (opts.hasImage
    ? 'Reference image attached. Lock identity from the image; do not caption-dump the still.'
    : 'No reference pictures.')
  return `Mode: ${mode}\nAspect: ${aspectOf(opts.aspect, '1:1')}\nReference notes: ${refs}\n\nBrief:\n${brief}`
}
