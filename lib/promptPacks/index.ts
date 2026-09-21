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
import { NOVA_DYNAMIC_LIGHT_PACK } from './nova-dynamic-light'
import { NOVA_JSON_PACK } from './nova-json'
import { SEEDANCE_PACK } from './seedance'

export { CORE_PACK } from './core'
export { FLUX3_VIDEO_PACK } from './flux-3-video'
export { IMAGINE_VIDEO_PACK } from './imagine-video'
export { MINIMAX_H3_PACK } from './minimax-h3'
export { NL_IMAGE_PACK } from './nl-image'
export { NOVA_DYNAMIC_LIGHT_PACK } from './nova-dynamic-light'
export { NOVA_JSON_PACK } from './nova-json'
export { SEEDANCE_PACK } from './seedance'

export const PROMPT_TARGETS = [
  'nl-image',
  'minimax-h3',
  'seedance',
  'flux-3-video',
  'imagine-video',
  'nova-json',
  'nova-dynamic-light',
  'deepseek-chat',
] as const
export type PromptTarget = (typeof PROMPT_TARGETS)[number]
export const ADMIN_PROMPT_TARGETS = ['nova-json', 'nova-dynamic-light', 'deepseek-chat'] as const

const FAMILY: Partial<Record<PromptTarget, string>> = {
  'imagine-video': IMAGINE_VIDEO_PACK,
  'minimax-h3': MINIMAX_H3_PACK,
  'nl-image': NL_IMAGE_PACK,
  seedance: SEEDANCE_PACK,
  'flux-3-video': FLUX3_VIDEO_PACK,
  'nova-json': NOVA_JSON_PACK,
  'nova-dynamic-light': NOVA_DYNAMIC_LIGHT_PACK,
}

/** Frozen join between core and family. Changing this byte busts every cache. */
const SYSTEM_JOIN = '\n\n'

export const H3_MODES = ['T2VA', 'I2VA', 'FL2VA', 'L2VA', 'REF2VA'] as const
export type H3Mode = (typeof H3_MODES)[number]
export const IMAGINE_MODES = ['t2v', 'i2v', 'ref2v'] as const
export type ImagineMode = (typeof IMAGINE_MODES)[number]
export const SEEDANCE_MODES = ['t2v', 'i2v', 'fl2v', 'ref2v'] as const
export type SeedanceMode = (typeof SEEDANCE_MODES)[number]
export const FLUX3_MODES = ['t2v', 'i2v', 'v2v'] as const
export type Flux3Mode = (typeof FLUX3_MODES)[number]
export const NOVA_CAMERAS = ['phone', 'pro_still', 'camcorder'] as const
export type NovaCamera = (typeof NOVA_CAMERAS)[number]
export const NL_IMAGE_MODELS = [
  { id: 'auto', label: 'Any' },
  { id: 'flux', label: 'FLUX' },
  { id: 'krea', label: 'Krea' },
  { id: 'qwen-image', label: 'Qwen-Image' },
  { id: 'chatgpt-image', label: 'ChatGPT Image' },
  { id: 'nano-banana', label: 'Nano Banana' },
] as const
export type NlImageModel = (typeof NL_IMAGE_MODELS)[number]['id']
export const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '2:1'] as const
export const MAX_REF_IMAGES = 3

export function refToken(target: PromptTarget, index: number) {
  const n = index + 1
  if (target === 'minimax-h3') return `<Picture ${n}>`
  return `@Image ${n}`
}

export function isMultiRefMode(target: PromptTarget, mode?: string) {
  if (target === 'minimax-h3') return mode === 'REF2VA' || mode === 'FL2VA'
  if (target === 'imagine-video') return mode === 'ref2v'
  if (target === 'seedance') return mode === 'ref2v' || mode === 'fl2v'
  return false
}

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

export function isAdminPromptTarget(value: unknown): boolean {
  return (ADMIN_PROMPT_TARGETS as readonly string[]).includes(String(value || ''))
}

export function isNovaCamera(value: unknown): value is NovaCamera {
  return NOVA_CAMERAS.includes(value as NovaCamera)
}

export function isNlImageModel(value: unknown): value is NlImageModel {
  return NL_IMAGE_MODELS.some((row) => row.id === value)
}

function nlImageModelLabel(id: string) {
  return NL_IMAGE_MODELS.find((row) => row.id === id)?.label || 'Any'
}

export function isBareChatTarget(target: PromptTarget) {
  return target === 'deepseek-chat'
}

/** Exact system string to send. CORE first, then one family pack. Bare chat sends none. */
export function systemPackFor(target: PromptTarget) {
  if (target === 'deepseek-chat') return ''
  return CORE_PACK + SYSTEM_JOIN + (FAMILY[target] || '')
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
    camera?: string
    imageModel?: string
    refNotes?: string
    hasImage?: boolean
    imageCount?: number
  },
) {
  const brief = String(opts.brief || '').trim()
  const refsIn = String(opts.refNotes || '').trim()
  const imageCount = Math.max(0, Math.min(MAX_REF_IMAGES, Number(opts.imageCount) || (opts.hasImage ? 1 : 0)))
  const refMap = imageCount
    ? Array.from({ length: imageCount }, (_, i) => `${refToken(target, i)} = attached image ${i + 1}`).join('\n')
    : ''

  if (target === 'deepseek-chat') return brief

  if (target === 'minimax-h3') {
    const mode = isH3Mode(opts.mode) ? opts.mode : opts.hasImage ? 'I2VA' : 'T2VA'
    const refs = refsIn || (refMap
      ? (mode === 'REF2VA'
        ? `Identity/style refs (not first-frame unless the brief says so).\n${refMap}\nKeep these tokens in the output on the matching people/objects.`
        : mode === 'L2VA'
          ? `${refToken(target, 0)} is the last frame.\n${refMap}`
          : mode === 'FL2VA'
            ? `${refToken(target, 0)} is the first frame. ${imageCount > 1 ? `${refToken(target, 1)} is the last frame.` : 'Last frame is in the brief.'}\n${refMap}`
            : `${refToken(target, 0)} is the first frame.\n${refMap}`)
      : 'No reference pictures.')
    return `Mode: ${mode}\nDuration: ${durationSecOf(opts.durationSec, 6, 15)}s\nReference notes: ${refs}\n\nBrief:\n${brief}`
  }

  if (target === 'imagine-video') {
    const mode = isImagineMode(opts.mode) ? opts.mode : opts.hasImage ? 'i2v' : 't2v'
    const refs = refsIn || (refMap
      ? (mode === 'ref2v'
        ? `Style/character refs. Keep @Image N tokens in the output.\n${refMap}`
        : `First-frame image attached. Do not re-describe the still. Motion and sound only.\n${refMap}`)
      : 'No reference pictures.')
    return `Mode: ${mode}\nDuration: ${durationSecOf(opts.durationSec, 6, 15)}s\nAspect: ${aspectOf(opts.aspect, '16:9')}\nReference notes: ${refs}\n\nBrief:\n${brief}`
  }

  if (target === 'seedance') {
    const mode = isSeedanceMode(opts.mode) ? opts.mode : opts.hasImage ? 'i2v' : 't2v'
    const refs = refsIn || (refMap
      ? (mode === 'ref2v'
        ? `Identity/style refs. Keep @Image N tokens in the output.\n${refMap}`
        : mode === 'fl2v'
          ? `@Image 1 first frame. ${imageCount > 1 ? '@Image 2 last frame.' : 'Last frame in the brief.'}\n${refMap}`
          : `@Image 1 as first frame.\n${refMap}`)
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

  if (target === 'nl-image') {
    const imageModel = isNlImageModel(opts.imageModel) ? opts.imageModel : 'auto'
    const modelLine = imageModel === 'auto'
      ? 'Image model: auto (model-agnostic natural language)'
      : `Image model: ${nlImageModelLabel(imageModel)}. Adapt the prompt field to that model.`
    const mode = opts.hasImage ? 'i2i' : 't2i'
    const refs = refsIn || (opts.hasImage
      ? 'Reference image attached. Lock identity from the image; do not caption-dump the still.'
      : 'No reference pictures.')
    return `Mode: ${mode}\nAspect: ${aspectOf(opts.aspect, '1:1')}\n${modelLine}\nReference notes: ${refs}\n\nBrief:\n${brief}`
  }

  if (target === 'nova-json' || target === 'nova-dynamic-light') {
    const mode = opts.hasImage ? 'i2i' : 't2i'
    const camera = isNovaCamera(opts.camera) ? opts.camera : 'phone'
    const refs = refsIn || (opts.hasImage
      ? 'Reference still attached. Lock identity from the image; adapt pose, wardrobe, and setting from the brief. Never reduce the subject lock.'
      : 'No reference pictures.')
    return `Mode: ${mode}\nAspect: ${aspectOf(opts.aspect, '9:16')}\nCamera: ${camera}\nReference notes: ${refs}\n\nBrief:\n${brief}`
  }

  const mode = opts.hasImage ? 'i2i' : 't2i'
  const refs = refsIn || (opts.hasImage
    ? 'Reference image attached. Lock identity from the image; do not caption-dump the still.'
    : 'No reference pictures.')
  return `Mode: ${mode}\nAspect: ${aspectOf(opts.aspect, '1:1')}\nReference notes: ${refs}\n\nBrief:\n${brief}`
}
