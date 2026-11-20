-- NEXORUM BILLIARDS 3D — PostgreSQL Schema Migration 001
-- Designed for Railway PostgreSQL deployment

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  nickname VARCHAR(32) NOT NULL,
  avatar_color VARCHAR(16) NOT NULL DEFAULT '#10B981',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  selected_cue VARCHAR(32) NOT NULL DEFAULT 'maple_classic',
  selected_table VARCHAR(32) NOT NULL DEFAULT 'emerald',
  selected_environment VARCHAR(32) NOT NULL DEFAULT 'classic_club',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rankings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  elo INTEGER NOT NULL DEFAULT 1200,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  peak_elo INTEGER NOT NULL DEFAULT 1200,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rankings_elo ON rankings (elo DESC);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY,
  room_code VARCHAR(12),
  game_mode VARCHAR(16) NOT NULL,
  player1_id UUID REFERENCES users(id) ON DELETE SET NULL,
  player2_id UUID REFERENCES users(id) ON DELETE SET NULL,
  winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  win_reason TEXT NOT NULL,
  total_shots INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_players ON matches (player1_id, player2_id, finished_at DESC);

CREATE TABLE IF NOT EXISTS friends (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'accepted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id VARCHAR(48) NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);
