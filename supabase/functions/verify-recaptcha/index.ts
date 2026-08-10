const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Min score per action (v3 returns 0.0..1.0). Lower = more bot-like.
const MIN_SCORES: Record<string, number> = {
  signup: 0.5,
  login: 0.4,
  complaint: 0.5,
  order: 0.4,
  default: 0.5,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { token, action } = await req.json()
    if (!token || typeof token !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'missing token' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const secret = Deno.env.get('RECAPTCHA_V3_SECRET_KEY')
    if (!secret) {
      return new Response(JSON.stringify({ success: false, error: 'server not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const params = new URLSearchParams()
    params.append('secret', secret)
    params.append('response', token)

    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const result = await r.json()

    const minScore = MIN_SCORES[action as string] ?? MIN_SCORES.default
    const ok = !!result.success && (typeof result.score !== 'number' || result.score >= minScore)

    return new Response(
      JSON.stringify({
        success: ok,
        score: result.score,
        action: result.action,
        hostname: result.hostname,
        errorCodes: result['error-codes'],
      }),
      { status: ok ? 200 : 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})