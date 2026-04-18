ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS videos_workspace_pending_scheduled_idx
ON public.videos (workspace_id, status, scheduled_at)
WHERE status = 'pending';