import { createClient } from 'npm:@supabase/supabase-js@2'

// Suppression event payload (internal shape after normalizing Resend / manual calls)
interface SuppressionPayload {
  email: string
  reason: 'bounce' | 'complaint' | 'unsubscribe'
  message_id?: string
  metadata?: Record<string, unknown>
  is_retry: boolean
  retry_count: number
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

async function verifySvixSignature(
  req: Request,
  body: string,
  secret: string,
): Promise<boolean> {
  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) return false

  // Reject stale timestamps (>5 min)
  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false

  const key = secret.startsWith('whsec_')
    ? Uint8Array.from(atob(secret.slice('whsec_'.length)), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(secret)

  const signedContent = `${svixId}.${svixTimestamp}.${body}`
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(signedContent),
  )
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))

  // svix-signature may contain multiple "v1,..." space-separated values
  const candidates = svixSignature.split(' ').map((part) => {
    const [, value] = part.split(',')
    return value || part.replace(/^v1,/, '')
  })
  return candidates.some((c) => c === expected)
}

function normalizeResendEvent(parsed: Record<string, unknown>): SuppressionPayload | null {
  const type = String(parsed.type || '')
  const data = (parsed.data || {}) as Record<string, unknown>
  const toField = data.to
  const email = Array.isArray(toField)
    ? String(toField[0] || '')
    : typeof toField === 'string'
      ? toField
      : typeof data.email === 'string'
        ? data.email
        : ''

  if (!email) return null

  let reason: SuppressionPayload['reason'] | null = null
  if (type === 'email.bounced' || type === 'email.failed') reason = 'bounce'
  else if (type === 'email.complained') reason = 'complaint'
  else if (type === 'email.unsubscribed') reason = 'unsubscribe'
  else return null

  return {
    email,
    reason,
    message_id: typeof data.email_id === 'string' ? data.email_id : undefined,
    metadata: { provider: 'resend', type, raw: data },
    is_retry: false,
    retry_count: 0,
  }
}

function normalizeInternalPayload(parsed: Record<string, unknown>): SuppressionPayload {
  const data = (parsed.data || parsed) as Record<string, unknown>
  if (!data.email || !data.reason) {
    throw new Error('Missing required fields: email, reason')
  }
  return {
    email: String(data.email),
    reason: data.reason as SuppressionPayload['reason'],
    message_id: typeof data.message_id === 'string' ? data.message_id : undefined,
    metadata: (data.metadata as Record<string, unknown>) ?? undefined,
    is_retry: Boolean(data.is_retry),
    retry_count: Number(data.retry_count || 0),
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  const internalSecret = Deno.env.get('EMAIL_WEBHOOK_SECRET')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  const body = await req.text()

  // Auth: Resend Svix signature, or shared webhook secret, or service_role JWT
  let authorized = false
  if (webhookSecret) {
    authorized = await verifySvixSignature(req, body, webhookSecret)
  }
  if (!authorized && internalSecret) {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    authorized = token === internalSecret
  }
  if (!authorized) {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    const claims = token ? parseJwtClaims(token) : null
    authorized = claims?.role === 'service_role'
  }
  if (!authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let payload: SuppressionPayload
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    payload = normalizeResendEvent(parsed) ?? normalizeInternalPayload(parsed)
  } catch (error) {
    console.error('Invalid payload', { error })
    return jsonResponse({ error: 'Invalid payload' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const normalizedEmail = payload.email.toLowerCase()

  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert(
      {
        email: normalizedEmail,
        reason: payload.reason,
        metadata: payload.metadata ?? null,
      },
      { onConflict: 'email' },
    )

  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      error: suppressError,
      email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
    })
    return jsonResponse({ error: 'Failed to write suppression' }, 500)
  }

  const sendLogStatus = mapReasonToStatus(payload.reason)
  const sendLogMessage = mapReasonToMessage(payload.reason)

  const { error: insertError } = await supabase
    .from('email_send_log')
    .insert({
      message_id: payload.message_id ?? null,
      template_name: 'system',
      recipient_email: normalizedEmail,
      status: sendLogStatus,
      error_message: sendLogMessage,
      metadata: payload.metadata ?? null,
    })

  if (insertError) {
    console.warn('Failed to insert email_send_log', { error: insertError })
  }

  console.log('Suppression processed', {
    email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
    reason: payload.reason,
    is_retry: payload.is_retry,
    retry_count: payload.retry_count,
    has_message_id: !!payload.message_id,
  })

  return jsonResponse({ success: true })
})

function mapReasonToStatus(
  reason: string,
): 'bounced' | 'complained' | 'suppressed' {
  switch (reason) {
    case 'bounce':
      return 'bounced'
    case 'complaint':
      return 'complained'
    default:
      return 'suppressed'
  }
}

function mapReasonToMessage(reason: string): string {
  switch (reason) {
    case 'bounce':
      return 'Permanent bounce — email address is invalid or rejected'
    case 'complaint':
      return 'Spam complaint — recipient marked email as spam'
    case 'unsubscribe':
      return 'Recipient unsubscribed'
    default:
      return 'Email suppressed'
  }
}
