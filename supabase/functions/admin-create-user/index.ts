import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const authorization = request.headers.get('Authorization') ?? ''

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
  })

  const { data: caller } = await callerClient.auth.getUser()
  if (!caller.user) return json({ error: 'No autenticado' }, 401)

  const { data: canManage } = await adminClient.rpc('has_permission_for_user', {
    target_user_id: caller.user.id,
    permission_key: 'users.manage',
  })
  if (!canManage) return json({ error: 'No tienes permiso para crear usuarios' }, 403)

  const body = await request.json()
  const { email, password, fullName, roleKey } = body
  if (!email || !password || !fullName || !roleKey) return json({ error: 'Faltan datos obligatorios' }, 400)

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createError || !created.user) return json({ error: createError?.message ?? 'No se pudo crear el usuario' }, 400)

  const { data: role, error: roleError } = await adminClient.from('roles').select('id').eq('key', roleKey).single()
  if (roleError || !role) return json({ error: 'El usuario fue creado, pero el rol no existe' }, 400)

  const { error: assignmentError } = await adminClient.from('user_roles').insert({ user_id: created.user.id, role_id: role.id })
  if (assignmentError) return json({ error: 'El usuario fue creado, pero no se pudo asignar el rol' }, 400)

  return json({ user: { id: created.user.id, email: created.user.email, fullName, roleKey } }, 201)
})

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
