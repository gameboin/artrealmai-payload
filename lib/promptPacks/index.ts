import { CORE_PACK } from './core'
import { IMAGINE_VIDEO_PACK } from './imagine-video'
import { MINIMAX_H3_PACK } from './minimax-h3'
import { NL_IMAGE_PACK } from './nl-image'

export const PROMPT_TARGETS = ['imagine-video', 'minimax-h3', 'nl-image'] as const
export type PromptTarget = (typeof PROMPT_TARGETS)[number]

const FAMILY: Record<PromptTarget, string> = {
  'imagine-video': IMAGINE_VIDEO_PACK,
  'minimax-h3': MINIMAX_H3_PACK,
  'nl-image': NL_IMAGE_PACK,
}

export const H3_MODES = ['T2VA', 'I2VA', 'FL2VA', 'L2VA'] as const
export type H3Mode = (typeof H3_MODES)[number]

export function isPromptTarget(value: unknown): value is PromptTarget {
  return PROMPT_TARGETS.includes(value as PromptTarget)
}

export function isH3Mode(value: unknown): value is H3Mode {
  return H3_MODES.includes(value as H3Mode)
}

export function systemPackFor(target: PromptTarget) {
  if (target === 'minimax-h3') return MINIMAX_H3_PACK
  return CORE_PACK + '\n' + FAMILY[target]
}

export function buildOptimizeUserText(
  target: PromptTarget,
  opts: { brief: string; mode?: string; durationSec?: number; refNotes?: string; hasImage?: boolean },
) {
  if (target !== 'minimax-h3') {
    return `Target: ${target}\nBrief:\n${opts.brief}`
  }
  const mode = isH3Mode(opts.mode)
    ? opts.mode
    : opts.hasImage
      ? 'I2VA'
      : 'T2VA'
  const duration = Number(opts.durationSec)
  const durationSec = Number.isFinite(duration) && duration > 0 ? duration : 6
  const refs = String(opts.refNotes || '').trim() || (opts.hasImage
    ? (mode === 'L2VA'
      ? 'Picture 1 is the last frame (image attached).'
      : mode === 'FL2VA'
        ? 'Picture 1 is the first frame (image attached). Picture 2 / last frame is described in the brief.'
        : 'Picture 1 is the first frame (image attached).')
    : 'No reference pictures.')
  return `Mode: ${mode}\nDuration: ${durationSec}s\nReference notes: ${refs}\n\nBrief:\n${opts.brief}`
}
