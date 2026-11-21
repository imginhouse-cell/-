-- =============================================================
-- รายงานการปฏิบัติงานส่วนบุคคล — โครงสร้างฐานข้อมูล Supabase
-- (ติดตั้งให้แล้วในโปรเจกต์ work-report · เก็บไว้เป็นเอกสาร/ใช้สร้างใหม่)
-- วิธีใช้กับโปรเจกต์ใหม่: Supabase > SQL Editor > วางทั้งไฟล์ > Run
-- =============================================================

-- ผู้ดูแลระบบ (เห็นและลบรายงานของทุกคน)
create table public.admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
insert into public.admins(email) values ('img.inhouse@gmail.com');
-- เพิ่มผู้ดูแลคนอื่น: insert into public.admins(email) values ('someone@gmail.com');

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.email = lower(coalesce(auth.jwt()->>'email','')));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
create policy "admins readable by admins" on public.admins for select to authenticated using (public.is_admin());

-- โปรไฟล์ (จำชื่อ / รหัส / แผนก ไว้กรอกอัตโนมัติ)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text check (char_length(full_name) <= 120),
  emp_code text check (char_length(emp_code) <= 40),
  dept text check (char_length(dept) <= 120),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profile select own or admin" on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_admin());
create policy "profile insert own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profile update own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- รายงาน (1 แถว = 1 รายงาน, งานแต่ละช่วงเก็บใน periods แบบ JSON)
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  email text,
  name text not null check (char_length(name) between 1 and 120),
  emp_code text check (char_length(emp_code) <= 40),
  dept text check (char_length(dept) <= 120),
  work_date date not null,
  periods jsonb not null default '{}'::jsonb check (pg_column_size(periods) < 60000),
  sign_name text not null check (char_length(sign_name) between 1 and 120),
  sign_date date not null,
  signature text check (signature is null or (char_length(signature) < 80000 and signature like 'data:image/%')),
  submitted_at timestamptz not null default now()
);
create index reports_user_idx on public.reports(user_id);
create index reports_work_date_idx on public.reports(work_date desc);
create index reports_submitted_idx on public.reports(submitted_at desc);
alter table public.reports enable row level security;

-- ผู้ส่ง / อีเมล / เวลาที่ส่ง ถูกกำหนดโดยเซิร์ฟเวอร์ ปลอมจากหน้าเว็บไม่ได้
create or replace function public.reports_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.email := lower(auth.jwt()->>'email');
  new.submitted_at := now();
  return new;
end $$;
revoke all on function public.reports_stamp() from public, anon, authenticated;
create trigger reports_stamp before insert on public.reports for each row execute function public.reports_stamp();

create policy "report insert own" on public.reports for insert to authenticated with check (user_id = (select auth.uid()));
create policy "report select own or admin" on public.reports for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "report delete admin" on public.reports for delete to authenticated using (public.is_admin());

revoke all on public.reports, public.profiles, public.admins from anon;

-- มุมมอง 1 แถว = 1 งาน (ดูใน Table Editor หรือ export เป็น CSV ได้)
create or replace view public.report_items with (security_invoker = true) as
select r.id as report_id, r.submitted_at, r.email, r.name, r.emp_code, r.dept, r.work_date,
       p.key as period_key,
       case p.key when 'p1' then 'ช่วงที่ 1 08.00-12.00' when 'p2' then 'ช่วงที่ 2 13.00-17.00'
         else 'ช่วงที่ 3 OT ' || coalesce(p.value->>'otStart','') || '-' || coalesce(p.value->>'otEnd','') end as period_label,
       (t.ord)::int as seq, t.item->>'task' as task,
       case when jsonb_typeof(t.item->'qty') = 'number' then (t.item->>'qty')::numeric end as qty, t.item->>'unit' as unit,
       t.item->>'start' as start_time, t.item->>'end' as end_time, t.item->>'with' as with_whom,
       r.sign_name, r.sign_date
from public.reports r
cross join lateral jsonb_each(r.periods) p
cross join lateral jsonb_array_elements(case when jsonb_typeof(p.value->'rows') = 'array' then p.value->'rows' else '[]'::jsonb end) with ordinality t(item, ord);
revoke all on public.report_items from anon;
grant select on public.report_items to authenticated;
