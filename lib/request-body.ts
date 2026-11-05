export async function readJsonBody(request: Request, maxBytes = 16_384) {
  const reader = request.body?.getReader()
  if (!reader) return { ok: false as const, status: 400, error: 'A JSON request body is required.' }
  let size = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        return { ok: false as const, status: 413, error: 'The request is too large.' }
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return { ok: true as const, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false as const, status: 400, error: 'The request body is not valid JSON.' }
  } finally {
    reader.releaseLock()
  }
}
