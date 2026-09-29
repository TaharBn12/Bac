-- ============================================================
-- آية باك 2027 — إعداد قاعدة البيانات في Supabase
-- ============================================================
-- طريقة التنفيذ:
--   1) افتح مشروعك في https://supabase.com/dashboard
--   2) من القائمة الجانبية اختر:  SQL Editor
--   3) الصف هذا الملف كاملاً واضغط:  Run
--   4) ستظهر رسالة نجاح — انتهى! الموقع سيتصل تلقائياً.
--
-- ملاحظة: عند تغيير كلمة السر عدّل قيمة 'aya 2026'
-- في هذا الملف (ابحث واستبدل) ثم أعد تنفيذه.
-- ============================================================

-- ---------- 1) الجداول ----------
create table if not exists public.subjects (
  id         text primary key,
  name       text not null,
  icon       text not null default '📘',
  color      text not null default 'indigo',
  sort_order int  not null default 0
);

create table if not exists public.units (
  id         text primary key,
  subject_id text not null references public.subjects(id) on delete cascade,
  title      text not null,
  sort_order int  not null default 0
);

create table if not exists public.lessons (
  id         text primary key,
  unit_id    text not null references public.units(id) on delete cascade,
  title      text not null,
  sort_order int  not null default 0
);

create table if not exists public.resources (
  id            text primary key,
  lesson_id     text not null references public.lessons(id) on delete cascade,
  kind          text not null,          -- video | pdf | image | exercise
  title         text,
  url           text not null,          -- رابط مباشر / يوتيوب / sb:ملف مرفوع
  size          bigint,
  exercise_type text,                   -- video | pdf | link
  sort_order    int  not null default 0
);

-- ---------- 2) تفعيل الحماية (RLS) ----------
alter table public.subjects  enable row level security;
alter table public.units     enable row level security;
alter table public.lessons   enable row level security;
alter table public.resources enable row level security;

-- ---------- 3) السياسات ----------
-- القراءة: متاحة للجميع (زوار الموقع)
-- الكتابة: فقط لمن يرسل ترويسة x-admin-key بقيمة كلمة السر
do $$
declare
  t text;
begin
  foreach t in array array['subjects', 'units', 'lessons', 'resources'] loop

    execute format('drop policy if exists "public_read"   on public.%I;', t);
    execute format('drop policy if exists "admin_insert"  on public.%I;', t);
    execute format('drop policy if exists "admin_update"  on public.%I;', t);
    execute format('drop policy if exists "admin_delete"  on public.%I;', t);

    execute format(
      'create policy "public_read" on public.%I for select using (true);', t);

    execute format(
      'create policy "admin_insert" on public.%I for insert
         with check (current_setting(''request.headers'', true)::json ->> ''x-admin-key'' = %L);', t, 'aya 2026');

    execute format(
      'create policy "admin_update" on public.%I for update
         using      (current_setting(''request.headers'', true)::json ->> ''x-admin-key'' = %L)
         with check (current_setting(''request.headers'', true)::json ->> ''x-admin-key'' = %L);', t, 'aya 2026', 'aya 2026');

    execute format(
      'create policy "admin_delete" on public.%I for delete
         using (current_setting(''request.headers'', true)::json ->> ''x-admin-key'' = %L);', t, 'aya 2026');

  end loop;
end $$;

-- ---------- 4) مخزن الملفات (الفيديوهات والصور وPDF) ----------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- قراءة عامة للملفات (لأن المخزن عام)
drop policy if exists "media_public_read"  on storage.objects;
drop policy if exists "media_admin_upload" on storage.objects;
drop policy if exists "media_admin_delete" on storage.objects;

create policy "media_public_read" on storage.objects
  for select using (bucket_id = 'media');

-- الرفع مسموح فقط داخل المجلد الخاص بالإدارة
create policy "media_admin_upload" on storage.objects
  for insert with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'up-aya2027'
  );

-- الحذف مسموح فقط داخل المجلد الخاص بالإدارة
create policy "media_admin_delete" on storage.objects
  for delete using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'up-aya2027'
  );

-- ---------- تم! ✅ ----------
-- بعد التنفيذ بنجاح افتح الموقع وادخل لوحة التحكم:
-- سترى شارة «☁️ متصل بالسحابة» أعلى اللوحة.
