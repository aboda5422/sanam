const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const siteKey = Deno.env.get('RECAPTCHA_V3_SITE_KEY') || ''
  return new Response(JSON.stringify({ siteKey }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})