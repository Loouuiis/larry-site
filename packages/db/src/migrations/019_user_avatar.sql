-- Add avatar_url column to users table for profile picture storage
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
