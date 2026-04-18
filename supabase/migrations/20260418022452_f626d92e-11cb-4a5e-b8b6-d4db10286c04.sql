-- Allow workspace owners to look up users by email when inviting members.
-- This is a SECURITY DEFINER function so it can read public.profiles
-- (which normally only allows users to read their own row), but it strictly
-- verifies that the caller is an owner of the target workspace before
-- returning anything.

CREATE OR REPLACE FUNCTION public.find_user_by_email_for_workspace(
  _workspace_id uuid,
  _email text
)
RETURNS TABLE (
  id uuid,
  email text,
  display_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only workspace owners can perform lookups.
  IF NOT public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner']::workspace_role[]) THEN
    RAISE EXCEPTION 'Apenas o owner pode buscar membros por email';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.display_name
  FROM public.profiles p
  WHERE p.email ILIKE trim(_email)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_user_by_email_for_workspace(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.find_user_by_email_for_workspace(uuid, text) TO authenticated;