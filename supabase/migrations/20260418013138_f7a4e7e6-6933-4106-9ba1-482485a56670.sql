-- Fix: PostgREST runs visibility check on RETURNING * before AFTER triggers fire,
-- causing creator to fail SELECT check immediately after insert.
-- Solution: also allow created_by to SELECT their workspace.

CREATE POLICY "Creators can view their workspaces"
ON public.workspaces
FOR SELECT
TO authenticated
USING (created_by = auth.uid());