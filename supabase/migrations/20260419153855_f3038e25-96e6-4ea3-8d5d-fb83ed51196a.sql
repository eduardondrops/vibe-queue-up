-- Tabela de convites
CREATE TABLE public.workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'editor',
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | revoked | expired
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID
);

CREATE INDEX idx_workspace_invitations_workspace ON public.workspace_invitations(workspace_id);
CREATE INDEX idx_workspace_invitations_email ON public.workspace_invitations(lower(email));
CREATE INDEX idx_workspace_invitations_token ON public.workspace_invitations(token);

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Owners podem ver os convites do seu workspace
CREATE POLICY "Owners can view invitations"
ON public.workspace_invitations FOR SELECT
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::workspace_role[]));

-- Owners podem criar convites
CREATE POLICY "Owners can create invitations"
ON public.workspace_invitations FOR INSERT
TO authenticated
WITH CHECK (
  public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::workspace_role[])
  AND invited_by = auth.uid()
);

-- Owners podem revogar (update status)
CREATE POLICY "Owners can update invitations"
ON public.workspace_invitations FOR UPDATE
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::workspace_role[]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::workspace_role[]));

-- Função pública para buscar info do convite pelo token (sem precisar de login)
-- Retorna apenas info segura para a tela de aceite
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token TEXT)
RETURNS TABLE(
  id UUID,
  workspace_id UUID,
  workspace_name TEXT,
  workspace_avatar_url TEXT,
  email TEXT,
  role public.workspace_role,
  status TEXT,
  expires_at TIMESTAMPTZ,
  invited_by_name TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.workspace_id,
    w.name AS workspace_name,
    w.avatar_url AS workspace_avatar_url,
    i.email,
    i.role,
    i.status,
    i.expires_at,
    p.display_name AS invited_by_name
  FROM public.workspace_invitations i
  JOIN public.workspaces w ON w.id = i.workspace_id
  LEFT JOIN public.profiles p ON p.id = i.invited_by
  WHERE i.token = _token
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO anon, authenticated;

-- Função para aceitar o convite (precisa estar logado)
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(_token TEXT)
RETURNS TABLE(workspace_id UUID, workspace_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv RECORD;
  _user_email TEXT;
  _user_id UUID;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado para aceitar o convite';
  END IF;

  -- Pega o convite
  SELECT * INTO _inv
  FROM public.workspace_invitations
  WHERE token = _token
  LIMIT 1;

  IF _inv IS NULL THEN
    RAISE EXCEPTION 'Convite não encontrado';
  END IF;

  IF _inv.status = 'accepted' THEN
    RAISE EXCEPTION 'Este convite já foi aceito';
  END IF;

  IF _inv.status = 'revoked' THEN
    RAISE EXCEPTION 'Este convite foi revogado';
  END IF;

  IF _inv.expires_at < now() THEN
    UPDATE public.workspace_invitations SET status = 'expired' WHERE id = _inv.id;
    RAISE EXCEPTION 'Este convite expirou';
  END IF;

  -- Verifica se o email do usuário logado bate com o do convite
  SELECT email INTO _user_email FROM public.profiles WHERE id = _user_id;
  IF lower(_user_email) <> lower(_inv.email) THEN
    RAISE EXCEPTION 'Este convite foi enviado para outro email (%). Faça login com a conta correta.', _inv.email;
  END IF;

  -- Adiciona como membro (ou atualiza role se já for membro)
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_inv.workspace_id, _user_id, _inv.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Marca como aceito
  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = _user_id
  WHERE id = _inv.id;

  RETURN QUERY
  SELECT w.id, w.name FROM public.workspaces w WHERE w.id = _inv.workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(TEXT) TO authenticated;

-- Garante o constraint único usado no ON CONFLICT acima
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_workspace_user_unique'
  ) THEN
    ALTER TABLE public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_user_unique UNIQUE (workspace_id, user_id);
  END IF;
END$$;