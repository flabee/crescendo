-- Audio-embedding similarity layer (step 1 of the BPM-curve pivot).
-- Similarity SELECTs candidate tracks; the existing BPM curve still ORDERs them.

create extension if not exists vector;

create table if not exists track_embeddings (
  id uuid primary key default gen_random_uuid(),
  track_id text not null,
  isrc text,
  preview_url text,
  model text not null,
  embedding vector(512) not null,
  created_at timestamptz not null default now(),
  unique (track_id, model)
);

-- Approximate nearest-neighbor index for cosine distance (`<=>`) queries,
-- scoped per model so a future embedding model doesn't degrade this one's recall.
create index if not exists track_embeddings_embedding_cosine_idx
  on track_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists track_embeddings_model_idx on track_embeddings (model);

-- Ranks candidate_ids by cosine similarity to query_embedding, scoped to one
-- model/version. `1 - cosine_distance` so higher = more similar (1 = identical).
create or replace function match_track_embeddings(
  query_embedding vector(512),
  match_model text,
  candidate_ids text[]
)
returns table (track_id text, similarity float)
language sql stable
as $$
  select track_id, 1 - (embedding <=> query_embedding) as similarity
  from track_embeddings
  where model = match_model
    and track_id = any(candidate_ids)
  order by embedding <=> query_embedding
$$;
