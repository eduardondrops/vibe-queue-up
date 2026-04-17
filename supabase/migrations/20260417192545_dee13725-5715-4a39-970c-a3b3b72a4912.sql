-- Enums
create type public.app_role as enum ('admin', 'client');
create type public.video_status as enum ('pending', 'posted', 'skipped');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles owner select" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "Profiles owner update" on public.profiles
  for update to authenticated using (auth.uid() = id);
create policy "Profiles owner insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Roles read own" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "Roles admins read all" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Roles admins manage" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Auto profile + bootstrap first admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_first boolean;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  select not exists (select 1 from public.user_roles) into is_first;
  if is_first then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'client');
  end if;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Videos
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  video_url text not null,
  storage_path text not null,
  caption text not null default '',
  hashtags text not null default '',
  status public.video_status not null default 'pending',
  queue_position integer,
  scheduled_at timestamptz,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_videos_status_queue on public.videos (status, queue_position);
create index idx_videos_scheduled_at on public.videos (scheduled_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_videos_updated_at
  before update on public.videos
  for each row execute function public.set_updated_at();

alter table public.videos enable row level security;

create policy "Videos auth read" on public.videos
  for select to authenticated using (
    public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'client')
  );
create policy "Videos admin insert" on public.videos
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Videos auth update" on public.videos
  for update to authenticated using (
    public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'client')
  ) with check (
    public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'client')
  );
create policy "Videos admin delete" on public.videos
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Storage bucket
insert into storage.buckets (id, name, public) values ('videos', 'videos', true)
on conflict (id) do nothing;

create policy "Videos bucket public read" on storage.objects
  for select to public using (bucket_id = 'videos');
create policy "Videos bucket admin upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'videos' and public.has_role(auth.uid(), 'admin')
  );
create policy "Videos bucket admin delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'videos' and public.has_role(auth.uid(), 'admin')
  );