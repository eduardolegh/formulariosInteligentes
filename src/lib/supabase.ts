const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en el archivo .env.local',
  )
}

type SessionResult = {
  data: { session: null }
  error: Error | null
}

/**
 * Small connection adapter used until the Supabase SDK can be installed.
 * The next Auth iteration will replace this with createClient from
 * @supabase/supabase-js without changing the rest of the application.
 */
export const supabase = {
  auth: {
    async getSession(): Promise<SessionResult> {
      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: { apikey: supabasePublishableKey },
        })

        // A 401 means Supabase is reachable but there is no signed-in user.
        if (response.ok || response.status === 401) {
          return { data: { session: null }, error: null }
        }

        return {
          data: { session: null },
          error: new Error(`Supabase respondió con HTTP ${response.status}`),
        }
      } catch (error) {
        return {
          data: { session: null },
          error: error instanceof Error ? error : new Error('No se pudo conectar con Supabase'),
        }
      }
    },
  },
}
