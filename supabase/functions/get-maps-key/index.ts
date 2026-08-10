const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const key = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!key) {
    return new Response(JSON.stringify({ error: 'Google Maps API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ key }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
