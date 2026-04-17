-- 1. Clean existing videos and storage references
DELETE FROM public.videos;

-- 2. Create workspaces table
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_url TEXT,
  instagram_url TEXT,
  tiktok_url TEXT,
  youtube_url TEXT,
  facebook_url TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Workspace members (access control)
CREATE TYPE public.workspace_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- 4. Security definer helpers (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id UUID, _user_id UUID, _roles public.workspace_role[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND role = ANY(_roles)
  )
$$;

-- 5. Enable RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- 6. Workspaces policies
CREATE POLICY "Members can view their workspaces"
ON public.workspaces FOR SELECT TO authenticated
USING (public.is_workspace_member(id, auth.uid()));

CREATE POLICY "Authenticated can create workspaces"
ON public.workspaces FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners/editors can update workspace"
ON public.workspaces FOR UPDATE TO authenticated
USING (public.has_workspace_role(id, auth.uid(), ARRAY['owner','editor']::public.workspace_role[]))
WITH CHECK (public.has_workspace_role(id, auth.uid(), ARRAY['owner','editor']::public.workspace_role[]));

CREATE POLICY "Owners can delete workspace"
ON public.workspaces FOR DELETE TO authenticated
USING (public.has_workspace_role(id, auth.uid(), ARRAY['owner']::public.workspace_role[]));

-- 7. Workspace members policies
CREATE POLICY "Members can view membership of their workspaces"
ON public.workspace_members FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Owners can add members"
ON public.workspace_members FOR INSERT TO authenticated
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::public.workspace_role[]));

CREATE POLICY "Owners can update members"
ON public.workspace_members FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::public.workspace_role[]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::public.workspace_role[]));

CREATE POLICY "Owners can remove members or self leave"
ON public.workspace_members FOR DELETE TO authenticated
USING (
  public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner']::public.workspace_role[])
  OR user_id = auth.uid()
);

-- 8. Trigger: when workspace is created, add creator as owner
CREATE OR REPLACE FUNCTION public.add_workspace_creator_as_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_workspace_created
AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.add_workspace_creator_as_owner();

-- 9. Updated_at trigger for workspaces
CREATE TRIGGER set_workspaces_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. Restructure videos table for workspaces
ALTER TABLE public.videos
  ADD COLUMN workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN base_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN posted_at TIMESTAMPTZ;

CREATE INDEX idx_videos_workspace ON public.videos(workspace_id);
CREATE INDEX idx_videos_workspace_scheduled ON public.videos(workspace_id, scheduled_at);
CREATE INDEX idx_videos_posted_at ON public.videos(posted_at) WHERE status = 'posted';

-- 11. Drop old role-based video policies and replace with workspace-based ones
DROP POLICY IF EXISTS "Videos admin delete" ON public.videos;
DROP POLICY IF EXISTS "Videos admin insert" ON public.videos;
DROP POLICY IF EXISTS "Videos admin update" ON public.videos;
DROP POLICY IF EXISTS "Videos auth read" ON public.videos;
DROP POLICY IF EXISTS "Videos client status update" ON public.videos;

CREATE POLICY "Workspace members can view videos"
ON public.videos FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace editors+ can insert videos"
ON public.videos FOR INSERT TO authenticated
WITH CHECK (
  public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','editor']::public.workspace_role[])
  AND uploaded_by = auth.uid()
);

CREATE POLICY "Workspace editors+ can update videos"
ON public.videos FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','editor']::public.workspace_role[]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','editor']::public.workspace_role[]));

CREATE POLICY "Workspace owners can delete videos"
ON public.videos FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','editor']::public.workspace_role[]));

-- 12. Drop the old guard trigger (no longer applicable)
DROP TRIGGER IF EXISTS guard_videos_client_update_trg ON public.videos;
DROP FUNCTION IF EXISTS public.guard_videos_client_update();

-- 13. Storage bucket for workspace avatars (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-avatars', 'workspace-avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Workspace avatars public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'workspace-avatars');

CREATE POLICY "Authenticated can upload workspace avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'workspace-avatars');

CREATE POLICY "Users can update own uploaded avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'workspace-avatars' AND owner = auth.uid())
WITH CHECK (bucket_id = 'workspace-avatars' AND owner = auth.uid());

CREATE POLICY "Users can delete own uploaded avatars"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'workspace-avatars' AND owner = auth.uid());

-- 14. Storage policies for videos bucket: workspace-scoped
DROP POLICY IF EXISTS "Videos bucket admin write" ON storage.objects;
DROP POLICY IF EXISTS "Videos bucket admin read" ON storage.objects;
DROP POLICY IF EXISTS "Videos bucket admin update" ON storage.objects;
DROP POLICY IF EXISTS "Videos bucket admin delete" ON storage.objects;
DROP POLICY IF EXISTS "Videos bucket auth read" ON storage.objects;

CREATE POLICY "Workspace members can read videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'videos');

CREATE POLICY "Workspace members can upload videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'videos');

CREATE POLICY "Uploaders can update own videos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'videos' AND owner = auth.uid())
WITH CHECK (bucket_id = 'videos' AND owner = auth.uid());

CREATE POLICY "Uploaders can delete own videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'videos' AND owner = auth.uid());