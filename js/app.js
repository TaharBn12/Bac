/* ============================================================
   آية باك 2027 — المنطق المشترك (البيانات، الحماية، الملفات)
   ============================================================ */
'use strict';

/* ============ الإعدادات ============ */
/* كلمات المرور: تُقرأ من js/supabase-config.js إن وُجدت */
var APP_PASSWORD  = (typeof SITE_PASSWORD  !== 'undefined' && SITE_PASSWORD)  ? SITE_PASSWORD  : 'aya 2026';  /* دخول الموقع */
var ADMIN_PASS    = (typeof ADMIN_PASSWORD !== 'undefined' && ADMIN_PASSWORD) ? ADMIN_PASSWORD : 'taha 2026'; /* لوحة التحكم */
const STORAGE_KEY  = 'ayaBacData.v1';
const AUTH_KEY     = 'ayaBacAuth';
const REMEMBER_KEY = 'ayaBacRemember';
const ADMIN_KEY_STORE = 'ayaBacAdmin';
const NEXT_KEY     = 'ayaBacNext';

/* ============ أدوات عامة ============ */
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function uid(prefix) {
  return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function escapeHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function param(name) { return new URLSearchParams(location.search).get(name); }
function byOrder(a, b) { return (a.order || 0) - (b.order || 0); }

/* ============ أيقونات المواد (SVG / صورة عبر رابط / إيموجي قديم) ============ */
/* هل القيمة رابط صورة؟ (http/https أو data: أو ملف مرفوع sb:) */
function isImageIcon(v) {
  v = String(v == null ? '' : v).trim();
  return /^(https?:)?\/\//i.test(v) || v.indexOf('data:image/') === 0 || isSbUrl(v);
}

/* مصدر الصورة (تحويل sb: إلى رابط عام في Supabase) */
function iconSrc(v) {
  v = String(v || '').trim();
  if (isSbUrl(v)) {
    if (typeof Cloud !== 'undefined' && Cloud.publicUrl) return Cloud.publicUrl(v.slice(3));
    return SUPABASE_URL + '/storage/v1/object/public/' + SUPABASE_BUCKET + '/' + v.slice(3);
  }
  if (v.indexOf('//') === 0) return 'https:' + v;
  return v;
}

/* HTML الأيقونة: SVG بالاسم، أو صورة عبر رابط، أو نص (إيموجي قديم يُحوَّل تلقائياً إلى SVG) */
function iconHTML(v, fallbackName) {
  v = String(v == null ? '' : v).trim();
  var fb = fallbackName || 'book';
  if (!v) return svgIcon(fb);
  if (isImageIcon(v)) {
    return '<img class="icon-img" src="' + escapeHtml(iconSrc(v)) + '" alt="" loading="lazy" onerror="this.onerror=null;this.remove()">';
  }
  var name = null;
  if (window.ICONS && window.ICONS[v]) name = v;                       /* اسم أيقونة */
  else if (window.EMOJI_ICON_MAP && window.EMOJI_ICON_MAP[v]) name = window.EMOJI_ICON_MAP[v]; /* إيموجي قديم */
  if (name) return svgIcon(name);
  return escapeHtml(v); /* نص حر */
}

/* استبدال عناصر <i data-icon="الاسم"></i> في HTML الثابت بأيقونات SVG */
function hydrateIcons(root) {
  $all('[data-icon]', root || document).forEach(function (el) {
    var svg = svgIcon(el.getAttribute('data-icon'));
    if (svg) el.outerHTML = svg;
    else el.remove();
  });
}

function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes === 0) return '0 بايت';
  var units = ['بايت', 'كب', 'مب', 'جب'];
  var i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  s = Math.floor(s);
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ':' : '') + (h ? String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
}

function toast(msg, type) {
  type = type || 'ok';
  var iconName = type === 'err' ? 'x-circle' : (type === 'info' ? 'info' : 'check-circle');
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.innerHTML = svgIcon(iconName) + '<span class="toast-msg"></span>';
  $('.toast-msg', t).textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(function () { t.classList.add('show'); });
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { t.remove(); }, 350);
  }, 2600);
}

function breadcrumb(items) {
  return '<nav class="crumbs">' + items.map(function (it) {
    var label = it.icon ? svgIcon(it.icon) + ' ' + escapeHtml(it.label) : escapeHtml(it.label);
    return it.href
      ? '<a href="' + it.href + '">' + label + '</a>'
      : '<span>' + label + '</span>';
  }).join('<span class="sep">/</span>') + '</nav>';
}

/* ============ البيانات (سحابية + محلية) ============ */
/* تُنادى قبل أي عرض للصفحة: تحاول الاتصال بـ Supabase ثم تحميل المحتوى */
function initData() {
  if (typeof Cloud !== 'undefined' && Cloud && typeof Cloud.connect === 'function') {
    return Cloud.connect().catch(function (e) {
      console.warn('Supabase غير متاح — العمل بالوضع المحلي:', e && e.message);
      return null;
    });
  }
  return Promise.resolve();
}

function isCloudMode() {
  return typeof Cloud !== 'undefined' && Cloud.mode === 'cloud' && window.CLOUD_DATA;
}

function loadData() {
  /* الوضع السحابي: البيانات المحمّلة من Supabase */
  if (isCloudMode()) return window.CLOUD_DATA;

  /* الوضع المحلي: من ذاكرة المتصفح */
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var d = JSON.parse(raw);
      if (d && Array.isArray(d.subjects)) return d;
    }
  } catch (e) { /* بيانات تالفة → نعيد التهيئة */ }
  var fresh = JSON.parse(JSON.stringify(window.DEFAULT_DATA));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveData(data) {
  if (isCloudMode()) {
    window.CLOUD_DATA = data;
    Cloud.syncAll(data);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function resetData() {
  localStorage.removeItem(STORAGE_KEY);
  /* في الوضع السحابي: نعيد الافتراضي في الذاكرة والمزامنة تُحدّث السحابة */
  if (isCloudMode()) return JSON.parse(JSON.stringify(window.DEFAULT_DATA));
  return loadData();
}

function getSubject(data, id) {
  var s = data.subjects.find(function (x) { return x.id === id; }) || null;
  if (s && s.hidden && !window.AYA_ADMIN_MODE) return null;
  return s;
}
function getUnit(data, id) {
  var u = data.units.find(function (x) { return x.id === id; }) || null;
  if (u && u.hidden && !window.AYA_ADMIN_MODE) return null;
  return u;
}
function getLesson(data, id) {
  var l = data.lessons.find(function (x) { return x.id === id; }) || null;
  if (l && l.hidden && !window.AYA_ADMIN_MODE) return null;
  return l;
}

/* معامل المادة الافتراضي حسب اسمها في البكالوريا إن لم يُحدَّد بعد */
function defaultSubjectCoefficient(name) {
  var n = String(name || '');
  if (/محاسبة|المحاسبي|طبيعة|طبيعية/i.test(n)) return 6;
  if (/رياضيات|فيزياء|اقتصاد/i.test(n)) return 5;
  if (/تاريخ|جغرافيا/i.test(n)) return 4;
  if (/عربية/i.test(n)) return 3;
  return 2;
}

function getSubjectCoefficient(subject) {
  if (!subject) return 2;
  var c = parseInt(subject.coefficient, 10);
  if (c && c >= 1 && c <= 20) return c;
  return defaultSubjectCoefficient(subject.name);
}

function visibleSubjectsOf(data, includeHidden) {
  var showAll = !!(includeHidden || window.AYA_ADMIN_MODE);
  return (data.subjects || []).filter(function (s) {
    return showAll || !s.hidden;
  }).sort(byOrder);
}

/* هل العنصر في جدول lessons عبارة عن تمرين مستقل داخل الوحدة أم درس عادي؟ */
function isExerciseItem(item) {
  return !!(item && (item.itemType === 'exercise' || String(item.id || '').indexOf('ex-') === 0));
}

function unitsOf(data, subjectId, includeHidden) {
  var showAll = !!(includeHidden || window.AYA_ADMIN_MODE);
  return data.units.filter(function (u) {
    return u.subjectId === subjectId && (showAll || !u.hidden);
  }).sort(byOrder);
}
function lessonsOf(data, unitId, includeHidden) {
  var showAll = !!(includeHidden || window.AYA_ADMIN_MODE);
  return data.lessons.filter(function (l) {
    return l.unitId === unitId && !isExerciseItem(l) && (showAll || !l.hidden);
  }).sort(byOrder);
}
function unitExercisesOf(data, unitId, includeHidden) {
  var showAll = !!(includeHidden || window.AYA_ADMIN_MODE);
  return data.lessons.filter(function (l) {
    return l.unitId === unitId && isExerciseItem(l) && (showAll || !l.hidden);
  }).sort(byOrder);
}
function allUnitItemsOf(data, unitId, includeHidden) {
  var showAll = !!(includeHidden || window.AYA_ADMIN_MODE);
  return data.lessons.filter(function (l) {
    return l.unitId === unitId && (showAll || !l.hidden);
  }).sort(byOrder);
}
function resourcesOf(data, lessonId, kind, includeHidden) {
  var showAll = !!(includeHidden || window.AYA_ADMIN_MODE);
  return data.resources.filter(function (r) {
    return r.lessonId === lessonId && (!kind || r.kind === kind) && (showAll || !r.hidden);
  }).sort(byOrder);
}

/* تجميع الموارد المرتبة في فقرات/مجموعات ديناميكية (عنوان + عنصر أو عدة عناصر) */
function groupResources(items) {
  var groups = [];
  var byGroupId = {};
  (items || []).forEach(function (item) {
    if (!item) return;
    if (item.groupId) {
      var g = byGroupId[item.groupId];
      if (!g) {
        g = {
          id: item.groupId,
          groupId: item.groupId,
          isExplicit: true,
          title: item.groupTitle || item.title || '',
          exerciseType: item.exerciseType || '',
          items: []
        };
        byGroupId[item.groupId] = g;
        groups.push(g);
      } else if (!g.title && (item.groupTitle || item.title)) {
        g.title = item.groupTitle || item.title;
      }
      g.items.push(item);
    } else {
      groups.push({
        id: 'single-' + item.id,
        groupId: '',
        isExplicit: false,
        title: item.groupTitle || item.title || '',
        exerciseType: item.exerciseType || '',
        items: [item]
      });
    }
  });
  groups.forEach(function (g) {
    g.allHidden = g.items.length > 0 && g.items.every(function (x) { return !!x.hidden; });
    g.someHidden = g.items.some(function (x) { return !!x.hidden; });
  });
  return groups;
}

/* ============ تتبّع إكمال الدروس والتمارين ودورة استعمال الزمن الأسبوعية ============ */
var COMPLETED_STORE_KEY = 'ayaBacCompleted.v1';

function getCompletedMap() {
  try {
    var raw = localStorage.getItem(COMPLETED_STORE_KEY);
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

function isItemCompleted(itemId) {
  if (!itemId) return false;
  var map = getCompletedMap();
  return !!map[itemId];
}

function setItemCompleted(itemId, completed) {
  if (!itemId) return false;
  var map = getCompletedMap();
  if (completed) {
    var entry = { completedAt: new Date().toISOString() };
    map[itemId] = entry;
    if (window.CLOUD_COMPLETED && typeof window.CLOUD_COMPLETED === 'object') {
      window.CLOUD_COMPLETED[itemId] = entry;
    }
  } else {
    delete map[itemId];
    if (window.CLOUD_COMPLETED && typeof window.CLOUD_COMPLETED === 'object') {
      delete window.CLOUD_COMPLETED[itemId];
    }
  }
  try {
    localStorage.setItem(COMPLETED_STORE_KEY, JSON.stringify(map));
  } catch (e) { /* تجاهل */ }
  if (typeof Cloud !== 'undefined' && Cloud && Cloud.mode === 'cloud' && typeof Cloud.syncCompletedItem === 'function') {
    Cloud.syncCompletedItem(itemId, !!completed);
  }
  try {
    window.dispatchEvent(new CustomEvent('aya:completion-changed', {
      detail: { itemId: itemId, completed: !!completed }
    }));
  } catch (e2) { /* تجاهل */ }
  return !!completed;
}

function toggleItemCompleted(itemId) {
  return setItemCompleted(itemId, !isItemCompleted(itemId));
}

/* حساب دورة الأسبوع الدراسي التي تتجدد كل يوم سبت على الساعة 22:00 (10:00 ليلاً) */
function getStudyCycleInfo(refDate) {
  var now = refDate ? new Date(refDate) : new Date();
  var anchor = new Date(now.getTime());
  var daysSinceSaturday = (anchor.getDay() + 1) % 7; /* السبت=0، الأحد=1، ... الجمعة=6 */
  anchor.setDate(anchor.getDate() - daysSinceSaturday);
  anchor.setHours(22, 0, 0, 0);

  /* إذا كنا يوم السبت قبل الساعة 22:00 ليلاً، فالدورة الحالية بدأت السبت الماضي 22:00 */
  if (anchor.getTime() > now.getTime()) {
    anchor.setDate(anchor.getDate() - 7);
  }

  var nextRenewal = new Date(anchor.getTime() + 7 * 24 * 60 * 60 * 1000);
  /* تأكيد ضبط الساعة 22:00 محلياً تحسباً لأي فرق توقيت */
  nextRenewal.setHours(22, 0, 0, 0);

  var y = anchor.getFullYear();
  var m = String(anchor.getMonth() + 1).padStart(2, '0');
  var d = String(anchor.getDate()).padStart(2, '0');
  var cycleKey = 'sat22-' + y + '-' + m + '-' + d;

  var sundayStart = new Date(anchor.getTime());
  sundayStart.setDate(sundayStart.getDate() + 1);
  sundayStart.setHours(0, 0, 0, 0);

  var saturdayEnd = new Date(sundayStart.getTime());
  saturdayEnd.setDate(saturdayEnd.getDate() + 6);

  var diffMs = Math.max(0, nextRenewal.getTime() - now.getTime());
  var totalSec = Math.floor(diffMs / 1000);
  var remDays = Math.floor(totalSec / 86400);
  var remHours = Math.floor((totalSec % 86400) / 3600);
  var remMinutes = Math.floor((totalSec % 3600) / 60);
  var remSeconds = totalSec % 60;

  return {
    cycleKey: cycleKey,
    anchor: anchor,
    nextRenewal: nextRenewal,
    sundayStart: sundayStart,
    saturdayEnd: saturdayEnd,
    remainingMs: diffMs,
    remaining: {
      days: remDays,
      hours: remHours,
      minutes: remMinutes,
      seconds: remSeconds
    }
  };
}
function lessonPath(data, lessonId) {
  var lesson = getLesson(data, lessonId);
  if (!lesson) return null;
  var unit = getUnit(data, lesson.unitId);
  var subject = unit ? getSubject(data, unit.subjectId) : null;
  return { lesson: lesson, unit: unit, subject: subject, isExercise: isExerciseItem(lesson) };
}

/* ============ الحماية والدخول ============ */
function isAuthed() {
  return sessionStorage.getItem(AUTH_KEY) === '1' || localStorage.getItem(REMEMBER_KEY) === '1';
}
/* الصفحات المحمية: إن لم يكن داخلاً نحفظ وجهته ونحوله لصفحة الدخول،
   وبعد الدخول يعود تلقائياً إلى نفس الصفحة (وليس للرئيسية) */
function requireAuth() {
  if (!isAuthed()) {
    try {
      sessionStorage.setItem(NEXT_KEY, location.pathname.split('/').pop() + location.search);
    } catch (e) { /* تجاهل */ }
    location.replace('index.html');
  }
}

/* وجهة العودة بعد تسجيل الدخول (صفحات الموقع فقط — لا روابط خارجية) */
function afterLoginUrl() {
  var next = '';
  try {
    next = sessionStorage.getItem(NEXT_KEY) || '';
    sessionStorage.removeItem(NEXT_KEY);
  } catch (e) { /* تجاهل */ }
  if (!/^[a-z]+\.html(\?.*)?$/i.test(next)) next = 'home.html';
  return next;
}

function doLogin(password, remember) {
  if (password === APP_PASSWORD) {
    sessionStorage.setItem(AUTH_KEY, '1');
    if (remember) localStorage.setItem(REMEMBER_KEY, '1');
    return true;
  }
  return false;
}
function doLogout() {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(ADMIN_KEY_STORE);
  localStorage.removeItem(REMEMBER_KEY);
  location.href = 'index.html';
}
function isAdminUnlocked() { return sessionStorage.getItem(ADMIN_KEY_STORE) === '1'; }
function unlockAdmin(password) {
  if (password === ADMIN_PASS) { sessionStorage.setItem(ADMIN_KEY_STORE, '1'); return true; }
  return false;
}

/* ============ الملفات المرفوعة (IndexedDB) ============ */
var _dbPromise = null;
function openFilesDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise(function (resolve, reject) {
    var req = indexedDB.open('ayaBacFiles', 1);
    req.onupgradeneeded = function () { req.result.createObjectStore('files', { keyPath: 'id' }); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
  return _dbPromise;
}
function filePut(file) { /* يحفظ ملفاً ويعيد رابطه الداخلي (sb: للسحابة / idb: محلياً) */
  /* الوضع السحابي: الرفع إلى Supabase Storage */
  if (typeof Cloud !== 'undefined' && Cloud.mode === 'cloud') {
    return Cloud.uploadFile(file).then(function (path) { return 'sb:' + path; });
  }
  /* الوضع المحلي: IndexedDB */
  return openFilesDB().then(function (db) {
    var rec = { id: uid('f'), name: file.name, mime: file.type, size: file.size, blob: file };
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(rec);
      tx.oncomplete = function () { resolve("idb:" + rec.id); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}
function fileGet(id) {
  return openFilesDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('files', 'readonly');
      var rq = tx.objectStore('files').get(id);
      rq.onsuccess = function () { resolve(rq.result || null); };
      rq.onerror = function () { reject(rq.error); };
    });
  });
}
function fileDelete(id) {
  return openFilesDB().then(function (db) {
    return new Promise(function (resolve) {
      var tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); };
    });
  });
}

/* ============ تحليل الروابط ============ */
function youtubeId(url) {
  var m = String(url || '').match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
function isIdbUrl(url) { return String(url || '').indexOf('idb:') === 0; }
function isSbUrl(url)  { return String(url || '').indexOf('sb:') === 0; }

var _objURLs = new Map();
/* يحوّل أي رابط (مباشر / مرفوع / يوتيوب) إلى مصدر قابل للتشغيل */
function resolveSrc(url) {
  url = String(url || '').trim();
  var yt = youtubeId(url);
  if (yt) return Promise.resolve({ kind: 'youtube', id: yt });
  if (isSbUrl(url)) {
    /* ملف مرفوع في Supabase Storage → رابطه العام */
    var path = url.slice(3);
    var src = (typeof Cloud !== 'undefined' && Cloud.publicUrl)
      ? Cloud.publicUrl(path)
      : SUPABASE_URL + '/storage/v1/object/public/media/' + path;
    var name = (typeof Cloud !== 'undefined' && Cloud.fileName) ? Cloud.fileName(path) : 'file';
    return Promise.resolve({ kind: 'src', src: src, fileName: name });
  }
  if (isIdbUrl(url)) {
    var id = url.slice(4);
    if (_objURLs.has(id)) {
      var c = _objURLs.get(id);
      return Promise.resolve({ kind: 'src', src: c.url, fileName: c.name, size: c.size });
    }
    return fileGet(id).then(function (rec) {
      if (!rec) return { kind: 'error', message: 'الملف المرفوع غير موجود في هذا المتصفح.' };
      var objUrl = URL.createObjectURL(rec.blob);
      _objURLs.set(id, { url: objUrl, name: rec.name, size: rec.size });
      return { kind: 'src', src: objUrl, fileName: rec.name, mime: rec.mime, size: rec.size };
    });
  }
  return Promise.resolve({ kind: 'src', src: url, fileName: guessFileName(url) });
}
function guessFileName(url) {
  try {
    var p = new URL(url, location.href).pathname;
    return decodeURIComponent(p.split('/').pop() || '') || 'file';
  } catch (e) { return 'file'; }
}

/* حذف ملف مرفوع مرتبط بمورد (عند حذف المورد) */
function deleteFileIfUploaded(url) {
  url = String(url || '');
  if (isSbUrl(url) && typeof Cloud !== 'undefined' && Cloud.mode === 'cloud') {
    return Cloud.removeFile(url.slice(3));
  }
  if (isIdbUrl(url)) return fileDelete(url.slice(4));
  return Promise.resolve();
}
