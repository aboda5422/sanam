import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { order_id, event } = await req.json()
    if (!order_id || (event !== 'on_the_way' && event !== 'delivered')) {
      return new Response(JSON.stringify({ error: 'invalid payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch order + driver
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, user_id, driver_id, drivers(full_name)')
      .eq('id', order_id)
      .maybeSingle()

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: 'order not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!order.user_id) {
      return new Response(JSON.stringify({ skipped: 'no user_id' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get user email via auth admin API
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(order.user_id)
    if (userErr || !userData?.user?.email) {
      return new Response(JSON.stringify({ skipped: 'no email' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const origin = req.headers.get('origin') || 'https://bazaarbasket.com.sa'
    const trackingUrl = `${origin}/order/${order.id}`
    const ratingUrl = `${origin}/order/${order.id}?rate=1`

    const templateName = event === 'delivered' ? 'order-delivered' : 'order-on-the-way'
    const templateData: Record<string, any> = {
      customerName: order.customer_name,
      orderNumber: order.order_number,
      driverName: (order as any).drivers?.full_name,
    }
    if (event === 'on_the_way') templateData.trackingUrl = trackingUrl
    if (event === 'delivered') templateData.ratingUrl = ratingUrl

    const { error: emailErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName,
        recipientEmail: userData.user.email,
        idempotencyKey: `${event}-${order.id}`,
        templateData,
      },
    })

    if (emailErr) {
      console.error('Email enqueue failed', emailErr)
      return new Response(JSON.stringify({ error: 'email failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
