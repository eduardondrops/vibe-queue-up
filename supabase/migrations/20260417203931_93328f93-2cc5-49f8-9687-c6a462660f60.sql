-- Restrict client updates on videos to rows they uploaded
DROP POLICY IF EXISTS "Videos client status update" ON public.videos;

CREATE POLICY "Videos client status update"
ON public.videos
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'client'::app_role)
  AND uploaded_by = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'client'::app_role)
  AND uploaded_by = auth.uid()
);