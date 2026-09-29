/* ============================================================
   آية باك 2027 — طبقة Supabase السحابية
   ------------------------------------------------------------
   • الوضع السحابي: المحتوى يُحفظ في Supabase ويظهر لكل الزوار
   • الوضع المحلي (احتياطي): إذا تعذّر الاتصال يعمل الموقع
     بالمحتوى المخزّن محلياً في المتصفح دون أي انقطاع
   ============================================================ */
'use strict';

var Cloud = {
  mode: 'local',        /* 'cloud' | 'local' */
  setupMissing: false,  /* true = جداول Supabase لم تُنشأ بعد */
  lastError: null,
  client: null,         /* عميل القراءة (بدون ترويسة الإدارة) */
  adminClient: null,    /* عميل الكتابة (مع ترويسة كلمة السر) */
  snapshot: null,       /* معرّفات الصفوف الموجودة حالياً في السحابة */
  _queue: Promise.resolve()
};

/* ============ أدوات ============ */
Cloud._withTimeout = function (promise, ms) {
  return new Promise(function (resolve, reject) {
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; reject(new Error('انتهت مهلة الاتصال بالسحابة')); }
    }, ms);
    Promise.resolve(promise).then(
      function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
      function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
    );
  });
};

/* رابط عام لملف في مخزن Supabase */
Cloud.publicUrl = function (path) {
  var enc = String(path || '').split('/').map(encodeURIComponent).join('/');
  return SUPABASE_URL + '/storage/v1/object/public/' + SUPABASE_BUCKET + '/' + enc;
};

Cloud.fileName = function (path) {
  var last = String(path || '').split('/').pop() || 'file';
  try { return decodeURIComponent(last); } catch (e) { return last; }
};

/* ============ الاتصال والتحميل ============ */
Cloud.connect = function () {
  var self = this;
  try {
    if (this.mode === 'cloud') return Promise.resolve(window.CLOUD_DATA);
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      return Promise.reject(new Error('مكتبة Supabase غير محمّلة'));
    }
    this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    /* فحص سريع: هل المشروع متاح والجداول منشأة؟ */
    return this._withTimeout(this.client.from('subjects').select('id').limit(1), 9000)
      .then(function (res) {
        if (res && res.error) {
          var msg = String((res.error && res.error.message) || res.error);
          if (/does not exist|could not find|schema cache|42P01|PGRST205/i.test(msg)) {
            self.setupMissing = true;
          }
          throw res.error;
        }
        return self.loadAll();
      })
      .then(function (d) {
        self.mode = 'cloud';
        self.lastError = null;
        window.CLOUD_DATA = d;
        /* نسخة احتياطية محلية للتصفح دون اتصال */
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch (e) { /* تجاهل */ }
        return d;
      });
  } catch (e) {
    return Promise.reject(e);
  }
};

/* تحميل كل المحتوى من السحابة */
Cloud.loadAll = function () {
  var c = this.client;
  return Promise.resolve().then(function () {
    return Promise.all([
      c.from('subjects').select('*'),
      c.from('units').select('*'),
      c.from('lessons').select('*'),
      c.from('resources').select('*')
    ]);
  }).then(function (rs) {
    for (var i = 0; i < rs.length; i++) {
      if (rs[i] && rs[i].error) throw rs[i].error;
    }
    var d = {
      subjects:  (rs[0].data || []).map(rowToSubject).sort(byOrder),
      units:     (rs[1].data || []).map(rowToUnit).sort(byOrder),
      lessons:   (rs[2].data || []).map(rowToLesson).sort(byOrder),
      resources: (rs[3].data || []).map(rowToResource).sort(byOrder)
    };
    Cloud.snapshot = snapshotOf(d);
    return d;
  });
};

Cloud.isEmpty = function (d) {
  d = d || window.CLOUD_DATA;
  return !!d && !d.subjects.length && !d.units.length && !d.lessons.length && !d.resources.length;
};

/* ============ المزامنة (كتابة كل شيء + حذف المحذوف) ============ */
Cloud.syncAll = function (data) {
  var self = this;
  var run = function () {
    return Promise.resolve().then(function () { return self._sync(data); });
  };
  this._queue = this._queue.then(run, run).catch(function (e) {
    self.lastError = e;
    console.error('Supabase sync:', e);
  });
  return this._queue;
};

Cloud._sync = function (data) {
  var self = this;
  if (this.mode !== 'cloud' || !this.client) return Promise.resolve();
  var c = this._writer();

  var tables = [
    { name: 'subjects',  rows: data.subjects.map(subjectToRow) },
    { name: 'units',     rows: data.units.map(unitToRow) },
    { name: 'lessons',   rows: data.lessons.map(lessonToRow) },
    { name: 'resources', rows: data.resources.map(resourceToRow) }
  ];

  var jobs = [];

  /* 1) حفظ/تحديث كل الصفوف */
  tables.forEach(function (t) {
    if (!t.rows.length) return;
    jobs.push(c.from(t.name).upsert(t.rows, { onConflict: 'id' }).then(function (res) {
      if (res && res.error) throw new Error(t.name + ': ' + res.error.message);
    }));
  });

  /* 2) حذف الصفوف التي لم تعد موجودة */
  var current = snapshotOf(data);
  var snap = this.snapshot || { subjects: [], units: [], lessons: [], resources: [] };
  Object.keys(snap).forEach(function (tn) {
    var toDelete = snap[tn].filter(function (id) { return current[tn].indexOf(id) === -1; });
    if (!toDelete.length) return;
    jobs.push(c.from(tn).delete().in('id', toDelete).then(function (res) {
      if (res && res.error) throw new Error(tn + ' (حذف): ' + res.error.message);
    }));
  });

  return Promise.all(jobs).then(function () {
    self.snapshot = current;
    self.lastError = null;
  }).catch(function (e) {
    self.lastError = e;
    console.error('Supabase sync:', e);
    toast('⚠️ تعذّرت المزامنة مع السحابة — سيُعاد المحاولة عند الحفظ القادم', 'err');
  });
};

/* عميل الكتابة: يُنشأ بأرويسة كلمة السر المطلوبة في سياسات RLS */
Cloud._writer = function () {
  if (!this.adminClient && window.supabase) {
    this.adminClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { 'x-admin-key': ADMIN_KEY } },
      auth: { persistSession: false }
    });
  }
  return this.adminClient || this.client;
};
Cloud.makeAdmin = function () { return this._writer(); };

/* ============ الملفات (Supabase Storage) ============ */
Cloud.uploadFile = function (file) {
  var self = this;
  var c = this._writer();
  if (!c) return Promise.reject(new Error('لا يوجد اتصال بالسحابة'));

  var safe = String(file.name || 'file')
    .replace(/[\\/:*?"<>|#%&{}$!`@+=;]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(-70) || 'file';
  var path = SUPABASE_UPLOAD_FOLDER + '/' + uid('f') + '-' + safe;

  toast('⬆️ جارٍ رفع الملف إلى السحابة...');

  return c.storage.from(SUPABASE_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream'
  }).then(function (res) {
    if (res && res.error) throw res.error;
    return path;
  }).catch(function (e) {
    self.lastError = e;
    throw e;
  });
};

Cloud.removeFile = function (path) {
  if (this.mode !== 'cloud') return Promise.resolve();
  var c = this._writer();
  if (!c) return Promise.resolve();
  return c.storage.from(SUPABASE_BUCKET).remove([path]).catch(function (e) {
    console.warn('تعذّر حذف الملف من السحابة:', e);
  });
};

/* ============ التحويل بين صيغة التطبيق وصيغة قاعدة البيانات ============ */
function subjectToRow(s)  { return { id: s.id, name: s.name, icon: s.icon || '📘', color: s.color || 'indigo', sort_order: s.order || 0 }; }
function unitToRow(u)     { return { id: u.id, subject_id: u.subjectId, title: u.title, sort_order: u.order || 0 }; }
function lessonToRow(l)   { return { id: l.id, unit_id: l.unitId, title: l.title, sort_order: l.order || 0 }; }
function resourceToRow(r) {
  return {
    id: r.id, lesson_id: r.lessonId, kind: r.kind,
    title: r.title || '', url: r.url, size: r.size || null,
    exercise_type: r.exerciseType || null, sort_order: r.order || 0
  };
}
function rowToSubject(r)  { return { id: r.id, name: r.name, icon: r.icon, color: r.color, order: r.sort_order }; }
function rowToUnit(r)     { return { id: r.id, subjectId: r.subject_id, title: r.title, order: r.sort_order }; }
function rowToLesson(r)   { return { id: r.id, unitId: r.unit_id, title: r.title, order: r.sort_order }; }
function rowToResource(r) {
  return {
    id: r.id, lessonId: r.lesson_id, kind: r.kind, title: r.title,
    url: r.url, size: r.size, exerciseType: r.exercise_type, order: r.sort_order
  };
}

function snapshotOf(d) {
  return {
    subjects:  d.subjects.map(function (x) { return x.id; }),
    units:     d.units.map(function (x) { return x.id; }),
    lessons:   d.lessons.map(function (x) { return x.id; }),
    resources: d.resources.map(function (x) { return x.id; })
  };
}
