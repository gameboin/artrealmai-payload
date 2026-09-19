export const DEEPSEEK_MODEL = 'deepseek-flash'

export type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
}

export type DeepSeekResult = {
  content: string
  finishReason: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_cache_hit_tokens?: number
  }
}

function deepseekConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY || ''
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
  return { apiKey, baseUrl }
}

export function deepseekEnabled() {
  return Boolean(deepseekConfig().apiKey)
}

export async function deepseekChat(messages: DeepSeekMessage[], maxTokens = 2048): Promise<DeepSeekResult> {
  const { apiKey, baseUrl } = deepseekConfig()
  if (!apiKey) {
    throw new Error('DEEPSEEK_UNWIRED')
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  })
  const json = (await res.json().catch(() => null)) as {
    error?: { message?: string }
    choices?: Array<{
      finish_reason?: string
      message?: { content?: string | null }
    }>
    usage?: DeepSeekResult['usage']
  } | null
  if (!res.ok) {
    const msg = json?.error?.message || `DeepSeek HTTP ${res.status}`
    throw new Error(msg)
  }
  const choice = json?.choices?.[0]
  return {
    content: String(choice?.message?.content || '').trim(),
    finishReason: String(choice?.finish_reason || ''),
    usage: json?.usage,
  }
}
