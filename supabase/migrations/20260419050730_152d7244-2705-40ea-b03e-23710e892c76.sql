-- Add YouTube-specific fields to videos table
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS yt_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS yt_description text NOT NULL DEFAULT '';