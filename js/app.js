/* ============================================================
   آية باك 2027 — المنطق المشترك (البيانات، الحماية، الملفات)
   ============================================================ */
'use strict';

/* ============ الإعدادات ============ */
const APP_PASSWORD = 'aya 2026'; // ← كلمة السر (يمكنك تغييرها من هنا فقط)
const STORAGE_KEY  = 'ayaBacData.v1';
const AUTH_KEY     = 'ayaBacAuth';
const REMEMBER_KEY = 'ayaBacRemember';
const ADMIN_KEY    = 'ayaBacAdmin';

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
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(function () { t.classList.add('show'); });
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { t.remove(); }, 350);
  }, 2600);
}

function breadcrumb(items) {
  return '<nav class="crumbs">' + items.map(function (it) {
    return it.href
      ? '<a href="' + it.href + '">' + escapeHtml(it.label) + '</a>'
      : '<span>' + escapeHtml(it.label) + '</span>';
  }).join('<span class="sep">/</span>') + '</nav>';
}

/* ============ البيانات (localStorage) ============ */
function loadData() {
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
function saveData(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function resetData() { localStorage.removeItem(STORAGE_KEY); return loadData(); }

function getSubject(data, id) { return data.subjects.find(function (s) { return s.id === id; }) || null; }
function getUnit(data, id)    { return data.units.find(function (u) { return u.id === id; }) || null; }
function getLesson(data, id) { return data.lessons.find(function (l) { return l.id === id; }) || null; }

function unitsOf(data, subjectId) {
  return data.units.filter(function (u) { return u.subjectId === subjectId; }).sort(byOrder);
}
function lessonsOf(data, unitId) {
  return data.lessons.filter(function (l) { return l.unitId === unitId; }).sort(byOrder);
}
function resourcesOf(data, lessonId, kind) {
  return data.resources.filter(function (r) {
    return r.lessonId === lessonId && (!kind || r.kind === kind);
  }).sort(byOrder);
}
function lessonPath(data, lessonId) {
  var lesson = getLesson(data, lessonId);
  if (!lesson) return null;
  var unit = getUnit(data, lesson.unitId);
  var subject = unit ? getSubject(data, unit.subjectId) : null;
  return { lesson: lesson, unit: unit, subject: subject };
}

/* ============ الحماية والدخول ============ */
function isAuthed() {
  return sessionStorage.getItem(AUTH_KEY) === '1' || localStorage.getItem(REMEMBER_KEY) === '1';
}
function requireAuth() { if (!isAuthed()) location.replace('index.html'); }

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
  sessionStorage.removeItem(ADMIN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  location.href = 'index.html';
}
function isAdminUnlocked() { return sessionStorage.getItem(ADMIN_KEY) === '1'; }
function unlockAdmin(password) {
  if (password === APP_PASSWORD) { sessionStorage.setItem(ADMIN_KEY, '1'); return true; }
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
function filePut(file) { /* يحفظ ملفاً ويعيد معرّفه */
  return openFilesDB().then(function (db) {
    var rec = { id: uid('f'), name: file.name, mime: file.type, size: file.size, blob: file };
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(rec);
      tx.oncomplete = function () { resolve(rec.id); };
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

var _objURLs = new Map();
/* يحوّل أي رابط (مباشر / مرفوع / يوتيوب) إلى مصدر قابل للتشغيل */
function resolveSrc(url) {
  url = String(url || '').trim();
  var yt = youtubeId(url);
  if (yt) return Promise.resolve({ kind: 'youtube', id: yt });
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
  if (isIdbUrl(url)) return fileDelete(url.slice(4));
  return Promise.resolve();
}
