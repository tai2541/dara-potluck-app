# Potluck-App-React (Supabase polling)

Shared guest list with Supabase (no realtime required).

## Setup

1) **Create the table** in Supabase (SQL Editor):
```
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dish text not null,
  categories jsonb not null default '[]',
  rsvp text not null check (rsvp in ('yes','maybe','no')),
  notes text,
  created_at timestamptz default now()
);
alter table guests enable row level security;
create policy "Public read"   on guests for select using (true);
create policy "Public insert" on guests for insert with check (true);
create policy "Public update" on guests for update using (true);
create policy "Public delete" on guests for delete using (true);
```

2) **Enable env vars**
- Local `.env`:
```
VITE_SUPABASE_URL=YOUR_PROJECT_URL
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```
- Vercel → Project → Settings → Environment Variables → same keys/values → Redeploy.

3) **Install & run**
```
npm install
npm run dev
```

4) **Deploy**
Push to GitHub → Vercel auto-builds (Build: `npm run build`, Output: `dist`).

This build uses **5s polling** to sync changes for all users.
