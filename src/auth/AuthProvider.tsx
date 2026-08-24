import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [permissions, setPermissions] = useState<string[]>([])
  const [permissionsLoading, setPermissionsLoading] = useState(false)

  async function loadPermissions(userId: string | undefined) {
    if (!userId) {
      setPermissions([])
      setPermissionsLoading(false)
      return
    }

    setPermissionsLoading(true)
    const { data: assignments, error: assignmentsError } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId)

    if (assignmentsError || !assignments?.length) {
      setPermissions([])
      setPermissionsLoading(false)
      return
    }

    const roleIds = assignments.map((assignment) => assignment.role_id)
    const { data: rolePermissions, error: rolePermissionsError } = await supabase
      .from('role_permissions')
      .select('permission_id')
      .in('role_id', roleIds)

    if (rolePermissionsError || !rolePermissions?.length) {
      setPermissions([])
      setPermissionsLoading(false)
      return
    }

    const permissionIds = rolePermissions.map((rolePermission) => rolePermission.permission_id)
    const { data: permissionRows } = await supabase
      .from('permissions')
      .select('key')
      .in('id', permissionIds)

    setPermissions((permissionRows ?? []).map((permission) => permission.key))
    setPermissionsLoading(false)
  }

  useEffect(() => {
    let isMounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      void loadPermissions(data.session?.user.id)
      setIsLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        setSession(nextSession)
        void loadPermissions(nextSession?.user.id)
      }
    })
    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({
    session,
    isLoading,
    permissions,
    permissionsLoading,
    hasPermission: (permission: string) => permissions.includes(permission),
  }), [isLoading, permissions, permissionsLoading, session])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
