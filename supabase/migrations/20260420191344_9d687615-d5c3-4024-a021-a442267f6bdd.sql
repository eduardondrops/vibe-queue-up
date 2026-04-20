
CREATE TABLE public.workspace_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  slots TEXT[] NOT NULL DEFAULT ARRAY['10:00','18:30','21:00']::text[],
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace schedule"
ON public.workspace_schedule FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Owners can insert workspace schedule"
ON public.workspace_schedule FOR INSERT
TO authenticated
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::workspace_role[]));

CREATE POLICY "Owners can update workspace schedule"
ON public.workspace_schedule FOR UPDATE
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::workspace_role[]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::workspace_role[]));

CREATE POLICY "Owners can delete workspace schedule"
ON public.workspace_schedule FOR DELETE
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::workspace_role[]));

CREATE TRIGGER update_workspace_schedule_updated_at
BEFORE UPDATE ON public.workspace_schedule
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Trigger: auto-create a default schedule when a new workspace is created
CREATE OR REPLACE FUNCTION public.create_default_workspace_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_schedule (workspace_id, slots, timezone)
  VALUES (NEW.id, ARRAY['10:00','18:30','21:00']::text[], 'America/Sao_Paulo')
  ON CONFLICT (workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_workspace_default_schedule
AFTER INSERT ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.create_default_workspace_schedule();

-- Backfill existing workspaces
INSERT INTO public.workspace_schedule (workspace_id, slots)
VALUES
  ('969ef1f2-21ca-4bfc-992d-0e64dbe6beae', ARRAY['10:00','18:30','21:00']::text[]),
  ('6fae7690-fb66-433b-ad54-8fac112f05a7', ARRAY['12:00','18:30']::text[]),
  ('a0075b3d-6c6f-428b-85a1-9ab2a8a456e5', ARRAY['12:00']::text[]),
  ('19949f00-13cb-449e-a757-88f320ba1202', ARRAY['12:00']::text[])
ON CONFLICT (workspace_id) DO UPDATE SET slots = EXCLUDED.slots;
