/* ============================================================
   آية باك 2027 — الإعدادات (كلمات المرور + Supabase)
   ============================================================
   • SITE_PASSWORD  : كلمة سر دخول الموقع (الصفحة الأولى)
   • ADMIN_PASSWORD : كلمة سر لوحة التحكم (الأدمن) — وهي أيضاً
                     مفتاح الكتابة في Supabase (x-admin-key)

   تنبيه: عند تغيير ADMIN_PASSWORD يجب تحديث نفس القيمة في ملف
   supabase-setup.sql ثم إعادة تنفيذه في SQL Editor.
   ============================================================ */
'use strict';

/* كلمة سر دخول الموقع */
var SITE_PASSWORD = 'aya 2026';

/* كلمة سر لوحة التحكم (الأدمن) */
var ADMIN_PASSWORD = 'taha 2026';

/* رابط مشروعك في Supabase */
var SUPABASE_URL = 'https://cazwkhcbkzhnsluuafwz.supabase.co';

/* المفتاح العام (anon) — آمن للنشر في الموقع */
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhendraGNia3pobnNsdXVhZnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDQ3ODIsImV4cCI6MjA4MzUyMDc4Mn0.u1l9BrzI7ZA9P3CSdXN0tYkHu1TUNTGsqczByNSPUN0';

/* اسم مخزن الملفات (bucket) في Supabase Storage */
var SUPABASE_BUCKET = 'media';

/* المجلد الذي تُرفع إليه الملفات (مطلوب في سياسات التخزين) */
var SUPABASE_UPLOAD_FOLDER = 'up-aya2027';
