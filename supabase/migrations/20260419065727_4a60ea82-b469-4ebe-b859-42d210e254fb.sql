-- Tabela de API tokens (1 ativo por usuário)
CREATE TABLE public.api_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Chrome Extension',
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_tokens_user_active 
  ON public.api_tokens (user_id) 
  WHERE revoked_at IS NULL;

CREATE INDEX idx_api_tokens_hash 
  ON public.api_tokens (token_hash) 
  WHERE revoked_at IS NULL;

-- Garante apenas 1 token ativo por usuário
CREATE UNIQUE INDEX idx_api_tokens_one_active_per_user 
  ON public.api_tokens (user_id) 
  WHERE revoked_at IS NULL;

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- Usuário vê seus próprios tokens (sem o hash exposto via select normal — mas RLS controla)
CREATE POLICY "Users can view own tokens"
  ON public.api_tokens
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own tokens"
  ON public.api_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can revoke own tokens"
  ON public.api_tokens
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Função SECURITY DEFINER usada pelo endpoint para validar token
-- Recebe o hash (sha-256 do token bruto) e retorna user_id se válido
CREATE OR REPLACE FUNCTION public.validate_api_token(_token_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
BEGIN
  SELECT user_id INTO _user_id
  FROM public.api_tokens
  WHERE token_hash = _token_hash
    AND revoked_at IS NULL
  LIMIT 1;

  IF _user_id IS NOT NULL THEN
    UPDATE public.api_tokens
    SET last_used_at = now()
    WHERE token_hash = _token_hash
      AND revoked_at IS NULL;
  END IF;

  RETURN _user_id;
END;
$$;