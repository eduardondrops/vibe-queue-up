-- Super-admin check based on auth email (hardcoded to owner email).
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) = 'eduardonunesdrops@gmail.com'
  )
$$;

-- Returns every workspace + member + role (only when caller is super admin).
CREATE OR REPLACE FUNCTION public.admin_list_all_memberships()
RETURNS TABLE (
  workspace_id uuid,
  workspace_name text,
  workspace_avatar_url text,
  user_id uuid,
  user_email text,
  user_display_name text,
  role workspace_role,
  joined_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    w.id AS workspace_id,
    w.name AS workspace_name,
    w.avatar_url AS workspace_avatar_url,
    m.user_id,
    p.email AS user_email,
    p.display_name AS user_display_name,
    m.role,
    m.created_at AS joined_at
  FROM public.workspaces w
  LEFT JOIN public.workspace_members m ON m.workspace_id = w.id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  ORDER BY w.name ASC, m.role ASC, p.display_name ASC NULLS LAST;
END;
$$;