ALTER TABLE public.workspace_schedule
ADD COLUMN IF NOT EXISTS active_weekdays integer[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6];

-- Atualiza a função de criação default para incluir o novo campo
CREATE OR REPLACE FUNCTION public.create_default_workspace_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.workspace_schedule (workspace_id, slots, timezone, active_weekdays)
  VALUES (NEW.id, ARRAY['10:00','18:30','21:00']::text[], 'America/Sao_Paulo', ARRAY[0,1,2,3,4,5,6])
  ON CONFLICT (workspace_id) DO NOTHING;
  RETURN NEW;
END;
$function$;