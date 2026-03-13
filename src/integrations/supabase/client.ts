import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const loggingFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url

  try {
    const response = await fetch(input, init)

    if (!response.ok) {
      console.error('[Supabase]', init?.method || 'GET', url, '->', response.status, response.statusText)
    }

    return response
  } catch (error) {
    console.error('[Supabase]', init?.method || 'GET', url, 'network failure', error)
    throw error
  }
}

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
  {
    global: {
      fetch: loggingFetch,
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // correct for mobile
    },
  }
)
