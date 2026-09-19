/**
 * Prompt-optimizer packs for DeepSeek V4.1 Flash.
 *
 * Cache: system message MUST be systemPackFor(target) with no extra
 * prefix (no user id, date, or second pack). Token 0 is always CORE_PACK.
 * User-specific text belongs only in buildOptimizeUserText().
 */
import { CORE_PACK } from './core'
import { IMAGINE_VIDEO_PACK } from './imagine-video'
import { MINIMAX_H3_PACK } from './minimax-h3'
import { NL_IMAGE_PACK } from './nl-image'

export { CORE_PACK } from './core'
export { IMAGINE_VIDEO_PACK } from './imagine-video'
export { MINIMAX_H3_PACK } from './minimax-h3'
export { NL_IMAGE_PACK } from './nl-image'

export const PROMPT_TARGETS = ['imagine-video', 'minimax-h3', 'nl-image'] as const
export type PromptTarget = (typeof PROMPT_TARGETS)[number]

const FAMILY: Record<PromptTarget, string> = {
  'imagine-video': IMAGINE_VIDEO_PACK,
  'minimax-h3': MINIMAX_H3_PACK,
  'nl-image': NL_IMAGE_PACK,
}

/** Frozen join between core and family. Changing this byte busts every cache. */
const SYSTEM_JOIN = '\n\n'

export const H3_MODES = ['T2VA', 'I2VA', 'FL2VA', 'L2VA'] as const
export type H3Mode = (typeof H3_MODES)[number]
export const IMAGINE_MODES = ['t2v', 'i2v', 'ref2v'] as const
export type ImagineMode = (typeof IMAGINE_MODES)[number]
export const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] as const

export function isPromptTarget(value: unknown): value is PromptTarget {
  return PROMPT_TARGETS.includes(value as PromptTarget)
}

export function isH3Mode(value: unknown): value is H3Mode {
  return H3_MODES.includes(value as H3Mode)
}

export function isImagineMode(value: unknown): value is ImagineMode {
  return IMAGINE_MODES.includes(value as ImagineMode)
}

/** Exact system string to send. CORE first, then one family pack. */
export function systemPackFor(target: PromptTarget) {
  return CORE_PACK + SYSTEM_JOIN + FAMILY[target]
}

function durationSecOf(value: unknown, fallback = 6, max = 15) {
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
    return `Mode: ${mode}\nDuration: ${durationSecOf(opts.durationSec)}s\nReference notes: ${refs}\n\nBrief:\n${brief}`
  }

  if (target === 'imagine-video') {
    const mode = isImagineMode(opts.mode) ? opts.mode : opts.hasImage ? 'i2v' : 't2v'
    const refs = refsIn || (opts.hasImage
      ? 'First-frame image attached. Do not re-describe the still. Motion and sound only.'
      : 'No reference pictures.')
    return `Mode: ${mode}\nDuration: ${durationSecOf(opts.durationSec)}s\nAspect: ${aspectOf(opts.aspect, '16:9')}\nReference notes: ${refs}\n\nBrief:\n${brief}`
  }

  const mode = opts.hasImage ? 'i2i' : 't2i'
  const refs = refsIn || (opts.hasImage
    ? 'Reference image attached. Lock identity from the image; do not caption-dump the still.'
    : 'No reference pictures.')
  return `Mode: ${mode}\nAspect: ${aspectOf(opts.aspect, '1:1')}\nReference notes: ${refs}\n\nBrief:\n${brief}`
}
