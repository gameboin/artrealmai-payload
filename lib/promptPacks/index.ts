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

export function isPromptTarget(value: unknown): value is PromptTarget {
  return PROMPT_TARGETS.includes(value as PromptTarget)
}

export function systemPackFor(target: PromptTarget) {
  return CORE_PACK + '\n' + FAMILY[target]
}
