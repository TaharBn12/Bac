/* ============================================================
   آية باك 2027 — إعدادات Supabase (قاعدة البيانات السحابية)
   ============================================================
   ⚠️ لتغيير كلمة السر: غيّر ADMIN_KEY هنا ثم نفّذ التحديث في
   supabase-setup.sql (السياسات) — نفس القيمة في المكانين.
   ============================================================ */
'use strict';

/* رابط مشروعك في Supabase */
var SUPABASE_URL = 'https://cazwkhcbkzhnsluuafwz.supabase.co';

/* المفتاح العام (anon) — آمن للنشر في الموقع */
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhendraGNia3pobnNsdXVhZnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDQ3ODIsImV4cCI6MjA4MzUyMDc4Mn0.u1l9BrzI7ZA9P3CSdXN0tYkHu1TUNTGsqczByNSPUN0';

/* كلمة سر الإدارة — تُستخدم لكلمة دخول الموقع AND لتخويل الكتابة في Supabase */
var ADMIN_KEY = 'aya 2026';

/* اسم مخزن الملفات (bucket) في Supabase Storage */
var SUPABASE_BUCKET = 'media';

/* المجلد الذي تُرفع إليه الملفات (مطلوب في سياسات التخزين) */
var SUPABASE_UPLOAD_FOLDER = 'up-aya2027';
