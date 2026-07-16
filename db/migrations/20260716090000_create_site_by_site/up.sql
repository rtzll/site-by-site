create table collections (
  id text primary key,
  name text not null,
  source_type text not null check (source_type in ('bookmarks', 'paste')),
  created_at integer not null,
  updated_at integer not null
);

create table websites (
  id text primary key,
  collection_id text not null references collections(id) on delete cascade,
  input_url text not null,
  normalized_url text not null,
  final_url text,
  domain text not null,
  title text,
  embed_status text not null default 'unverified' check (embed_status in ('allowed', 'blocked', 'conditional', 'unverified', 'runtime_failed')),
  embed_reason text,
  http_status integer,
  rating integer not null default 1500,
  comparisons integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  skips integer not null default 0,
  last_checked_at integer,
  snapshot_url text,
  snapshot_status text,
  created_at integer not null,
  unique (collection_id, normalized_url)
);

create index websites_collection_ranking_idx on websites (collection_id, rating desc);
create index websites_collection_embed_idx on websites (collection_id, embed_status);

create table import_jobs (
  id text primary key,
  collection_id text references collections(id) on delete cascade,
  source_type text not null check (source_type in ('bookmarks', 'paste')),
  status text not null check (status in ('selecting', 'checking', 'complete', 'failed')),
  payload_json text,
  found_count integer not null default 0,
  ready_count integer not null default 0,
  checking_count integer not null default 0,
  unavailable_count integer not null default 0,
  error text,
  created_at integer not null,
  updated_at integer not null
);

create index import_jobs_collection_idx on import_jobs (collection_id, created_at desc);

create table url_check_jobs (
  id text primary key,
  collection_id text not null references collections(id) on delete cascade,
  website_id text not null references websites(id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'complete', 'failed')),
  attempts integer not null default 0,
  error text,
  created_at integer not null,
  updated_at integer not null,
  unique (website_id)
);

create index url_check_jobs_pending_idx on url_check_jobs (collection_id, status, created_at);

create table prepared_pairs (
  id text primary key,
  collection_id text not null references collections(id) on delete cascade,
  website_a_id text not null references websites(id) on delete cascade,
  website_b_id text not null references websites(id) on delete cascade,
  left_website_id text not null references websites(id) on delete cascade,
  right_website_id text not null references websites(id) on delete cascade,
  status text not null check (status in ('prepared', 'current', 'completed', 'discarded')),
  queue_position integer not null,
  created_at integer not null,
  shown_at integer,
  completed_at integer,
  check (website_a_id <> website_b_id),
  check (left_website_id <> right_website_id)
);

create index prepared_pairs_queue_idx on prepared_pairs (collection_id, status, queue_position);

create table comparisons (
  id text primary key,
  collection_id text not null references collections(id) on delete cascade,
  prepared_pair_id text not null unique references prepared_pairs(id) on delete cascade,
  website_a_id text not null references websites(id) on delete cascade,
  website_b_id text not null references websites(id) on delete cascade,
  left_website_id text not null references websites(id) on delete cascade,
  right_website_id text not null references websites(id) on delete cascade,
  outcome text not null check (outcome in ('left', 'right', 'skip')),
  winner_website_id text references websites(id) on delete set null,
  created_at integer not null
);

create index comparisons_recent_idx on comparisons (collection_id, created_at desc);

create table votes (
  id text primary key,
  comparison_id text not null unique references comparisons(id) on delete cascade,
  choice text not null check (choice in ('left', 'right', 'skip')),
  winner_website_id text references websites(id) on delete set null,
  created_at integer not null
);
