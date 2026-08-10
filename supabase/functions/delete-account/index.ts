import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = userData.user.id

    const admin = createClient(supabaseUrl, serviceKey)
    const body = await req.json().catch(() => ({}))
    const confirm = body?.confirm === true

    // 1) Check obligations: pending orders, open complaints
    const { data: pendingOrders } = await admin
      .from('orders')
      .select('id, status')
      .eq('user_id', userId)
      .not('status', 'in', '("delivered","cancelled")')

    const { data: openComplaints } = await admin
      .from('complaints')
      .select('id, status')
      .eq('user_id', userId)
      .eq('status', 'open')

    const pendingOrdersCount = pendingOrders?.length ?? 0
    const openComplaintsCount = openComplaints?.length ?? 0

    if (pendingOrdersCount > 0 || openComplaintsCount > 0) {
      return new Response(
        JSON.stringify({
          canDelete: false,
          pendingOrders: pendingOrdersCount,
          openComplaints: openComplaintsCount,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!confirm) {
      return new Response(
        JSON.stringify({ canDelete: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2) Anonymize financial/accounting records, then delete personal data
    // IMPORTANT: Past orders, order_items, and payments MUST be preserved for
    // accounting/legal purposes. We detach them from the user (anonymize) and
    // strip personally identifiable customer info from the order rows.
    await admin
      .from('orders')
      .update({
        user_id: null,
        customer_name: 'مستخدم محذوف',
        customer_phone: null,
        delivery_address: null,
        delivery_lat: null,
        delivery_lng: null,
        notes: null,
      })
      .eq('user_id', userId)

    // Detach payments from the deleted user (keep the financial record)
    await admin.from('payments').update({ user_id: null }).eq('user_id', userId)

    // Delete personal/non-financial data
    await admin.from('complaints').delete().eq('user_id', userId)
    await admin.from('driver_ratings').delete().eq('user_id', userId)
    await admin.from('user_addresses').delete().eq('user_id', userId)
    await admin.from('abandoned_carts').delete().eq('user_id', userId)
    await admin.from('page_views').delete().eq('user_id', userId)
    await admin.from('user_roles').delete().eq('user_id', userId)
    await admin.from('profiles').delete().eq('user_id', userId)

    // 3) Delete the auth user (permanent)
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
    if (deleteErr) {
      console.error('Failed to delete auth user', deleteErr)
      return new Response(
        JSON.stringify({ error: 'Failed to delete account', details: deleteErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ deleted: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('delete-account error', e)
    return new Response(
      JSON.stringify({ error: 'Internal error', details: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})