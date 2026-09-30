/* ============================================================
   آية باك 2027 — لوحة التحكم (إدارة كل محتوى الموقع)
   ============================================================ */
'use strict';

var SUBJECT_COLORS = ['indigo', 'teal', 'green', 'amber', 'purple', 'blue', 'sky', 'rose', 'emerald', 'orange', 'cyan', 'lime', 'pink', 'violet', 'slate'];
var COLOR_LABELS = {
  indigo: 'نيلي', teal: 'تركوازي', green: 'أخضر', amber: 'كهرماني', purple: 'أرجواني',
  blue: 'أزرق', sky: 'سماوي', rose: 'وردي داكن', emerald: 'زمردي', orange: 'برتقالي',
  cyan: 'سيان', lime: 'ليموني', pink: 'وردي', violet: 'بنفسجي', slate: 'رمادي'
};
var KIND_META = {
  video:    { icon: 'film', label: 'فيديو' },
  pdf:      { icon: 'file', label: 'ملف PDF' },
  image:    { icon: 'image', label: 'صورة' },
  exercise: { icon: 'pencil', label: 'تمرين' }
};

var data, currentTab = 'subjects';
var sel = { subject: '', unit: '', lesson: '' };
var pickedFiles = {}; /* ملفات مختارة مؤقتاً في نماذج الإضافة: pickedFiles[key] = File */

function initAdmin() {
  hydrateIcons();

  /* لوحة التحكم محمية بكلمة مرور الإدارة نفسها (البوابة أدناه)
     — لا تشترط تسجيل الدخول للموقع، ففتحها مباشرة يعرض البوابة فوراً */
  if (!isAdminUnlocked()) {
    $('#adminGate').hidden = false;
    bindGate();
    return;
  }
  showApp();
}

function bindGate() {
  $('#gateToggle').addEventListener('click', function () {
    var i = $('#gatePw');
    i.type = i.type === 'password' ? 'text' : 'password';
    this.innerHTML = i.type === 'password' ? svgIcon('eye') : svgIcon('eye-off');
  });
  $('#gateForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (unlockAdmin($('#gatePw').value)) {
      $('#adminGate').hidden = true;
      if (typeof Cloud !== 'undefined' && Cloud.mode === 'cloud') Cloud.makeAdmin();
      showApp();
    } else {
      $('#gateErr').hidden = false;
      var c = $('#gateCard');
      c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
      $('#gatePw').value = ''; $('#gatePw').focus();
    }
  });
  $('#gatePw').focus();
}

function showApp() {
  $('#adminApp').hidden = false;
  $('#logoutBtn').addEventListener('click', doLogout);

  /* الاتصال بالسحابة أولاً ثم تحميل البيانات */
  initData().then(function () {
    data = loadData();

    /* أول مرة على سحابة فارغة → نزرع المحتوى الافتراضي تلقائياً */
    if (isCloudMode() && Cloud.isEmpty(data)) {
      data = JSON.parse(JSON.stringify(window.DEFAULT_DATA));
      saveData(data);
      toast('تمت تهيئة المحتوى الأولي في السحابة');
    }

    updateCloudBadge();

    /* رابط مباشر لدرس معين: admin.html?lesson=xxx */
    var lessonId = param('lesson');
    if (lessonId && getLesson(data, lessonId)) {
      var path = lessonPath(data, lessonId);
      if (path.subject && path.unit) {
        sel.subject = path.subject.id;
        sel.unit = path.unit.id;
        sel.lesson = path.lesson.id;
        currentTab = 'content';
      }
    } else {
      var s0 = data.subjects.slice().sort(byOrder)[0];
      if (s0) sel.subject = s0.id;
      var u0 = s0 ? unitsOf(data, s0.id)[0] : null;
      if (u0) sel.unit = u0.id;
      var l0 = u0 ? lessonsOf(data, u0.id)[0] : null;
      if (l0) sel.lesson = l0.id;
    }

    $('#tabsNav').addEventListener('click', function (e) {
      var t = e.target.closest('.tab');
      if (!t) return;
      currentTab = t.dataset.tab;
      $all('.tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      renderPanel();
    });

    renderPanel();
  });
}

/* شارة حالة السحابة أعلى اللوحة */
function updateCloudBadge() {
  var el = $('#cloudStatus');
  if (!el) return;
  if (isCloudMode()) {
    el.innerHTML = svgIcon('cloud') + ' متصل بالسحابة';
    el.className = 'cloud-badge ok';
  } else if (typeof Cloud !== 'undefined' && Cloud.setupMissing) {
    el.innerHTML = svgIcon('alert') + ' أكمل ربط Supabase';
    el.className = 'cloud-badge warn';
  } else {
    el.innerHTML = svgIcon('cloud-off') + ' وضع محلي';
    el.className = 'cloud-badge off';
  }
}

/* تنبيه يظهر أعلى اللوحات عندما لا تكون السحابة متصلة */
function cloudBannerHTML() {
  if (isCloudMode()) return '';
  if (typeof Cloud !== 'undefined' && Cloud.setupMissing) {
    return '<div class="cloud-banner">' + svgIcon('alert') + ' <b>لم تُنشأ جداول Supabase بعد.</b><br>' +
      'خطوات الربط (مرة واحدة فقط):<br>' +
      '<b>1)</b> افتح مشروعك في <code>supabase.com/dashboard</code><br>' +
      '<b>2)</b> من القائمة الجانبية اختر <b>SQL Editor</b><br>' +
      '<b>3)</b> انسخ محتوى ملف <code>supabase-setup.sql</code> (الموجود مع ملفات الموقع) والصقه ثم اضغط <b>Run</b><br>' +
      '<b>4)</b> أعد فتح لوحة التحكم — ستتحول الشارة إلى «' + svgIcon('cloud') + ' متصل بالسحابة» ' + svgIcon('check') + '<br>' +
      '<span style="opacity:.8">حتى ذلك الحين يعمل الموقع بالوضع المحلي: المحتوى يُحفظ على هذا الجهاز فقط.</span></div>';
  }
  return '<div class="cloud-banner">' + svgIcon('cloud-off') + ' <b>الوضع المحلي:</b> تعذّر الوصول إلى Supabase الآن، لذا يُحفظ المحتوى على هذا الجهاز فقط. ' +
    'عند عودة الاتصال وتسجيل الدخول من جديد ستُزامَن التعديلات تلقائياً.</div>';
}

/* ============ أدوات خاصة باللوحة ============ */
function save() { saveData(data); }

function normalizeOrders(list) {
  list.slice().sort(byOrder).forEach(function (it, i) { it.order = i + 1; });
}

function moveItem(list, id, dir) {
  var sorted = list.slice().sort(byOrder);
  normalizeOrders(sorted);
  var i = sorted.findIndex(function (x) { return x.id === id; });
  var j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  var tmp = sorted[i].order;
  sorted[i].order = sorted[j].order;
  sorted[j].order = tmp;
  save();
}

/* وضع العنصر في ترتيب محدد من نافذة التعديل (بديل سريع عن الضغط المتكرر على الأسهم). */
function setItemOrder(list, id, requestedOrder) {
  var sorted = list.slice().sort(byOrder);
  var from = sorted.findIndex(function (x) { return x.id === id; });
  if (from < 0) return;
  var to = Math.max(0, Math.min(sorted.length - 1, (parseInt(requestedOrder, 10) || sorted.length) - 1));
  var item = sorted.splice(from, 1)[0];
  sorted.splice(to, 0, item);
  /* sorted يحمل الترتيب الجديد بالفعل، لذلك لا نعيد فرزه قبل ترقيمه. */
  sorted.forEach(function (it, index) { it.order = index + 1; });
}

/* عند نسخ المحتوى قد يشير أكثر من مورد إلى الملف المرفوع نفسه.
   لا نحذف الملف الفعلي إلا إذا لم يبق أي مورد يستعمله. */
function releaseFileIfUnused(url) {
  if (!url || data.resources.some(function (r) { return r.url === url; })) return;
  deleteFileIfUploaded(url);
}

function deleteCascade(where, id) {
  var removedResources = [];
  if (where === 'subject') {
    var unitIds = data.units.filter(function (u) { return u.subjectId === id; }).map(function (u) { return u.id; });
    var lessonIds = data.lessons.filter(function (l) { return unitIds.indexOf(l.unitId) !== -1; }).map(function (l) { return l.id; });
    removedResources = data.resources.filter(function (r) { return lessonIds.indexOf(r.lessonId) !== -1; });
    data.resources = data.resources.filter(function (r) { return lessonIds.indexOf(r.lessonId) === -1; });
    data.lessons = data.lessons.filter(function (l) { return lessonIds.indexOf(l.id) === -1; });
    data.units = data.units.filter(function (u) { return u.subjectId !== id; });
    data.subjects = data.subjects.filter(function (s) { return s.id !== id; });
  } else if (where === 'unit') {
    var lessonIds2 = data.lessons.filter(function (l) { return l.unitId === id; }).map(function (l) { return l.id; });
    removedResources = data.resources.filter(function (r) { return lessonIds2.indexOf(r.lessonId) !== -1; });
    data.resources = data.resources.filter(function (r) { return lessonIds2.indexOf(r.lessonId) === -1; });
    data.lessons = data.lessons.filter(function (l) { return l.unitId !== id; });
    data.units = data.units.filter(function (u) { return u.id !== id; });
  } else if (where === 'lesson') {
    removedResources = resourcesOf(data, id);
    data.resources = data.resources.filter(function (r) { return r.lessonId !== id; });
    data.lessons = data.lessons.filter(function (l) { return l.id !== id; });
  } else if (where === 'resource') {
    removedResources = data.resources.filter(function (r) { return r.id === id; });
    data.resources = data.resources.filter(function (r) { return r.id !== id; });
  }
  removedResources.map(function (r) { return r.url; }).filter(function (url, index, urls) {
    return urls.indexOf(url) === index;
  }).forEach(releaseFileIfUnused);
  save();
}

function subjectOptions(selectedId) {
  return '<option value="">— اختر المادة —</option>' + data.subjects.slice().sort(byOrder).map(function (s) {
    return '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>';
  }).join('');
}
function unitOptions(subjectId, selectedId) {
  var units = subjectId ? unitsOf(data, subjectId) : [];
  return '<option value="">— اختر الوحدة —</option>' + units.map(function (u) {
    return '<option value="' + u.id + '"' + (u.id === selectedId ? ' selected' : '') + '>' + escapeHtml(u.title) + '</option>';
  }).join('');
}
function lessonOptions(unitId, selectedId) {
  var lessons = unitId ? lessonsOf(data, unitId) : [];
  return '<option value="">— اختر الدرس —</option>' + lessons.map(function (l) {
    return '<option value="' + l.id + '"' + (l.id === selectedId ? ' selected' : '') + '>' + escapeHtml(l.title) + '</option>';
  }).join('');
}

function actsHTML(id, extra) {
  return '<div class="item-acts">' +
    (extra || '') +
    '<button class="icon-btn" data-act="up" data-id="' + id + '" title="تحريك للأعلى">' + svgIcon('chevron-up') + '</button>' +
    '<button class="icon-btn" data-act="down" data-id="' + id + '" title="تحريك للأسفل">' + svgIcon('chevron-down') + '</button>' +
    '<button class="icon-btn" data-act="rename" data-id="' + id + '" title="تعديل">' + svgIcon('pencil') + '</button>' +
    '<button class="icon-btn danger" data-act="del" data-id="' + id + '" title="حذف">' + svgIcon('trash') + '</button>' +
  '</div>';
}

/* التقاط أزرار القوائم (تعديل/حذف/ترتيب) بشكل مركزي */
function bindList(container, handlers) {
  container.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act, id = btn.dataset.id;
    if (act === 'up') handlers.up(id);
    else if (act === 'down') handlers.down(id);
    else if (act === 'rename') handlers.rename(id);
    else if (act === 'del') handlers.del(id);
    else if (act === 'copy' && handlers.copy) handlers.copy(id);
    else if (act === 'view' && handlers.view) handlers.view(id);
    else if (act === 'goto' && handlers.goto) handlers.goto(id);
  });
}

function fileLabelHTML(key, accept) {
  return '<label class="btn file-label">' + svgIcon('upload') + ' رفع من الجهاز' +
    '<input type="file" accept="' + accept + '" data-pick="' + key + '"></label>' +
    '<span class="file-picked" data-picked="' + key + '"></span>';
}

function bindFilePickers(root) {
  $all('input[data-pick]', root).forEach(function (inp) {
    inp.addEventListener('change', function () {
      var key = inp.dataset.pick;
      pickedFiles[key] = inp.files[0] || null;
      var lbl = $('[data-picked="' + key + '"]', root);
      if (lbl) lbl.innerHTML = pickedFiles[key]
        ? svgIcon('check') + ' ' + escapeHtml(pickedFiles[key].name) + ' (' + fmtSize(pickedFiles[key].size) + ')'
        : '';
      /* نملأ العنوان تلقائياً باسم الملف إن كان فارغاً */
      var titleInp = $('input[data-title="' + key + '"]', root);
      if (pickedFiles[key] && titleInp && !titleInp.value.trim()) {
        titleInp.value = pickedFiles[key].name.replace(/\.[^.]+$/, '');
      }
    });
  });
}

function clearPick(key) { delete pickedFiles[key]; }

/* ============ نافذة التعديل الموحدة (بدل النوافذ المنبثقة البدائية) ============ */
function colorOptions() {
  return SUBJECT_COLORS.map(function (c) { return { value: c, label: COLOR_LABELS[c] || c }; });
}

function openEditDialog(opts) {
  /* opts: { title, icon, fields: [{key,label,type,value,options,placeholder,dir}], onSave(values) } */

  var old = document.querySelector('.modal-overlay');
  if (old) old.remove();

  var fieldsHTML = opts.fields.map(function (f) {
    if (f.type === 'select') {
      return '<label class="field"><span>' + escapeHtml(f.label) + '</span>' +
        '<select class="inp" data-key="' + f.key + '">' +
        (f.options || []).map(function (o) {
          return '<option value="' + escapeHtml(o.value) + '"' + (o.value === f.value ? ' selected' : '') + '>' +
            escapeHtml(o.label) + '</option>';
        }).join('') + '</select></label>';
    }
    if (f.type === 'icon') {
      return '<label class="field"><span>' + escapeHtml(f.label) + '</span>' +
        '<div class="icon-field">' +
          '<input class="inp" data-key="' + f.key + '" dir="ltr" placeholder="' + escapeHtml(f.placeholder || '') + '" value="' + escapeHtml(f.value || '') + '">' +
          '<div class="icon-preview" data-preview="' + f.key + '">' + iconHTML(f.value, 'book') + '</div>' +
        '</div></label>';
    }
    return '<label class="field"><span>' + escapeHtml(f.label) + '</span>' +
      '<input class="inp" data-key="' + f.key + '" value="' + escapeHtml(f.value || '') + '"' +
      (f.type === 'number' ? ' type="number" min="1" step="1" inputmode="numeric"' : '') +
      (f.dir ? ' dir="' + f.dir + '"' : '') + ' placeholder="' + escapeHtml(f.placeholder || '') + '"></label>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true">' +
      '<h3>' + svgIcon(opts.icon || 'pencil') + ' ' + escapeHtml(opts.title) + '</h3>' +
      '<form class="edit-form">' + fieldsHTML +
        '<div class="acts">' +
          '<button type="button" class="btn" data-close>' + svgIcon('x') + ' إلغاء</button>' +
          '<button type="submit" class="btn btn-primary">' + svgIcon('check') + ' حفظ</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  document.body.appendChild(overlay);

  /* معاينة مباشرة للأيقونة */
  var iconInput = overlay.querySelector('input[data-key="icon"]');
  if (iconInput) {
    iconInput.addEventListener('input', function () {
      var pv = overlay.querySelector('[data-preview="icon"]');
      if (pv) pv.innerHTML = iconHTML(this.value, 'book');
    });
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.querySelector('.edit-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var values = {};
    opts.fields.forEach(function (f) {
      var el = overlay.querySelector('[data-key="' + f.key + '"]');
      values[f.key] = el ? el.value : '';
    });
    close();
    opts.onSave(values);
  });

  var first = overlay.querySelector('input, select');
  if (first) first.focus();
}

/* ============ نسخ العناصر ============ */
/* النسخ يحتفظ بالمراجع إلى الملفات نفسها ولا يعيد رفعها، لذلك هو سريع ولا يستهلك مساحة إضافية. */
function copyResourcesToLesson(sourceLessonId, targetLessonId) {
  resourcesOf(data, sourceLessonId).forEach(function (r) {
    data.resources.push({
      id: uid('r'), lessonId: targetLessonId, kind: r.kind,
      title: r.title || '', url: r.url, size: r.size || undefined,
      exerciseType: r.exerciseType || undefined, order: r.order || 1
    });
  });
}

function duplicateLesson(id) {
  var l = getLesson(data, id);
  if (!l) return null;
  var nid = uid('l');
  var maxOrder = lessonsOf(data, l.unitId).reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0);
  data.lessons.push({ id: nid, unitId: l.unitId, title: l.title + ' (نسخة)', order: maxOrder + 1 });
  copyResourcesToLesson(l.id, nid);
  save();
  return nid;
}

function duplicateUnit(id, targetSubjectId, deferSave) {
  var u = getUnit(data, id);
  if (!u) return null;
  var subjectId = targetSubjectId || u.subjectId;
  var nid = uid('u');
  var maxOrder = unitsOf(data, subjectId).reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0);
  data.units.push({ id: nid, subjectId: subjectId, title: u.title + ' (نسخة)', order: maxOrder + 1 });
  lessonsOf(data, id).forEach(function (l) {
    var newLessonId = uid('l');
    data.lessons.push({ id: newLessonId, unitId: nid, title: l.title, order: l.order });
    copyResourcesToLesson(l.id, newLessonId);
  });
  if (!deferSave) save();
  return nid;
}

function duplicateSubject(id) {
  var s = getSubject(data, id);
  if (!s) return null;
  var nid = uid('s');
  var maxOrder = data.subjects.reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0);
  data.subjects.push({ id: nid, name: s.name + ' (نسخة)', icon: s.icon || 'book', color: s.color || 'indigo', order: maxOrder + 1 });
  unitsOf(data, id).forEach(function (u) { duplicateUnit(u.id, nid, true); });
  save();
  return nid;
}

/* ============ عرض اللوحات ============ */
function renderPanel() {
  var p = $('#panel');
  if (currentTab === 'subjects') renderSubjectsPanel(p);
  else if (currentTab === 'organizer') renderOrganizerPanel(p);
  else if (currentTab === 'units') renderUnitsPanel(p);
  else if (currentTab === 'lessons') renderLessonsPanel(p);
  else if (currentTab === 'content') renderContentPanel(p);
  else if (currentTab === 'backup') renderBackupPanel(p);
  var banner = cloudBannerHTML();
  if (banner) p.insertAdjacentHTML('afterbegin', banner);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- منظّم المحتوى: رؤية كاملة للمادة ← الوحدة ← الدرس ---------- */
function goToAdminTab(tab) {
  currentTab = tab;
  $all('.tab').forEach(function (x) { x.classList.toggle('active', x.dataset.tab === tab); });
  renderPanel();
}

function openQuickUnitDialog(subjectId) {
  var subject = getSubject(data, subjectId);
  if (!subject) return;
  var nextOrder = unitsOf(data, subjectId).length + 1;
  openEditDialog({
    title: 'إضافة وحدة إلى ' + subject.name, icon: 'layers',
    fields: [
      { key: 'title', label: 'عنوان الوحدة', placeholder: 'مثال: الدوال العددية' },
      { key: 'order', label: 'موضعها في الترتيب', type: 'number', value: nextOrder }
    ],
    onSave: function (v) {
      var title = v.title.trim();
      if (!title) { toast('اكتب عنوان الوحدة', 'err'); return; }
      var id = uid('u');
      data.units.push({ id: id, subjectId: subjectId, title: title, order: nextOrder });
      setItemOrder(unitsOf(data, subjectId), id, v.order);
      save(); renderPanel(); toast('تمت إضافة الوحدة');
    }
  });
}

function openQuickLessonDialog(unitId) {
  var unit = getUnit(data, unitId);
  if (!unit) return;
  var nextOrder = lessonsOf(data, unitId).length + 1;
  openEditDialog({
    title: 'إضافة درس إلى ' + unit.title, icon: 'film',
    fields: [
      { key: 'title', label: 'عنوان الدرس', placeholder: 'مثال: تعريف الدالة' },
      { key: 'order', label: 'موضعه في الترتيب', type: 'number', value: nextOrder }
    ],
    onSave: function (v) {
      var title = v.title.trim();
      if (!title) { toast('اكتب عنوان الدرس', 'err'); return; }
      var id = uid('l');
      data.lessons.push({ id: id, unitId: unitId, title: title, order: nextOrder });
      setItemOrder(lessonsOf(data, unitId), id, v.order);
      save(); renderPanel(); toast('تمت إضافة الدرس');
    }
  });
}

function openCreatePathDialog() {
  openEditDialog({
    title: 'بناء مسار تعليمي جديد', icon: 'sparkles',
    fields: [
      { key: 'subject', label: 'اسم المادة', placeholder: 'مثال: الإعلام الآلي' },
      { key: 'icon', label: 'أيقونة المادة — اسم SVG أو رابط صورة (اختياري)', type: 'icon', value: 'book', placeholder: 'مثال: book أو https://...' },
      { key: 'color', label: 'لون المادة', type: 'select', value: 'indigo', options: colorOptions() },
      { key: 'unit', label: 'عنوان الوحدة الأولى', placeholder: 'مثال: البرمجة' },
      { key: 'lesson', label: 'عنوان الدرس الأول', placeholder: 'مثال: مدخل إلى الخوارزميات' }
    ],
    onSave: function (v) {
      var subjectName = v.subject.trim(), unitTitle = v.unit.trim(), lessonTitle = v.lesson.trim();
      if (!subjectName || !unitTitle || !lessonTitle) {
        toast('أكمل اسم المادة والوحدة والدرس', 'err');
        return;
      }
      var subjectId = uid('s'), unitId = uid('u'), lessonId = uid('l');
      data.subjects.push({
        id: subjectId, name: subjectName, icon: v.icon.trim() || 'book', color: v.color || 'indigo',
        order: data.subjects.length + 1
      });
      data.units.push({ id: unitId, subjectId: subjectId, title: unitTitle, order: 1 });
      data.lessons.push({ id: lessonId, unitId: unitId, title: lessonTitle, order: 1 });
      save(); renderPanel(); toast('تم إنشاء المادة والوحدة والدرس');
    }
  });
}

function treeUnitHTML(unit) {
  var lessons = lessonsOf(data, unit.id);
  var subject = getSubject(data, unit.subjectId);
  var unitSearch = (unit.title + ' ' + lessons.map(function (l) { return l.title; }).join(' ')).toLocaleLowerCase();
  return '<details class="tree-unit" open data-search="' + escapeHtml(unitSearch) + '">' +
    '<summary><span class="tree-label"><span class="tree-dot"></span>' + escapeHtml(unit.title) + '</span>' +
      '<span class="tree-meta">' + lessons.length + ' درس</span></summary>' +
    '<div class="tree-node-body">' +
      '<div class="tree-actions">' +
        '<button type="button" class="tree-action" data-organizer-act="add-lesson" data-id="' + unit.id + '">' + svgIcon('plus') + ' إضافة درس</button>' +
        '<button type="button" class="tree-action" data-organizer-act="manage-unit" data-id="' + unit.id + '">' + svgIcon('gear') + ' إدارة الوحدة</button>' +
        '<button type="button" class="tree-action" data-organizer-act="copy-unit" data-id="' + unit.id + '">' + svgIcon('copy') + ' نسخ</button>' +
      '</div>' +
      '<div class="tree-lessons">' +
        (lessons.length ? lessons.map(function (l) {
          var resources = resourcesOf(data, l.id).length;
          return '<article class="tree-lesson" data-search="' + escapeHtml(l.title.toLocaleLowerCase()) + '">' +
            '<span class="tree-lesson-title">' + svgIcon('film') + ' ' + escapeHtml(l.title) +
              '<span class="tree-meta">' + resources + ' محتوى</span></span>' +
            '<span class="tree-actions">' +
              '<button type="button" class="tree-action" data-organizer-act="manage-lesson" data-id="' + l.id + '">' + svgIcon('plus') + ' المحتوى</button>' +
              '<button type="button" class="tree-action" data-organizer-act="preview-lesson" data-id="' + l.id + '" title="معاينة الدرس" aria-label="معاينة الدرس">' + svgIcon('eye') + '</button>' +
            '</span>' +
          '</article>';
        }).join('') : '<div class="tree-empty">لا توجد دروس بعد — أضف أول درس من الزر أعلاه.</div>') +
      '</div>' +
    '</div>' +
  '</details>';
}

function treeSubjectHTML(subject) {
  var units = unitsOf(data, subject.id);
  var lessonsCount = units.reduce(function (sum, u) { return sum + lessonsOf(data, u.id).length; }, 0);
  var search = (subject.name + ' ' + units.map(function (u) {
    return u.title + ' ' + lessonsOf(data, u.id).map(function (l) { return l.title; }).join(' ');
  }).join(' ')).toLocaleLowerCase();
  return '<details class="tree-subject" open data-search="' + escapeHtml(search) + '">' +
    '<summary><span class="tree-label tree-subject-label">' + iconHTML(subject.icon, 'book') + ' ' + escapeHtml(subject.name) + '</span>' +
      '<span class="tree-meta">' + units.length + ' وحدة · ' + lessonsCount + ' درس</span></summary>' +
    '<div class="tree-node-body">' +
      '<div class="tree-actions">' +
        '<button type="button" class="tree-action primary" data-organizer-act="add-unit" data-id="' + subject.id + '">' + svgIcon('plus') + ' إضافة وحدة</button>' +
        '<button type="button" class="tree-action" data-organizer-act="manage-subject" data-id="' + subject.id + '">' + svgIcon('gear') + ' إدارة المادة</button>' +
        '<button type="button" class="tree-action" data-organizer-act="copy-subject" data-id="' + subject.id + '">' + svgIcon('copy') + ' نسخ المادة كاملة</button>' +
      '</div>' +
      '<div class="tree-units">' +
        (units.length ? units.map(treeUnitHTML).join('') : '<div class="tree-empty">لا توجد وحدات بعد — أضف أول وحدة من الزر أعلاه.</div>') +
      '</div>' +
    '</div>' +
  '</details>';
}

function renderOrganizerPanel(p) {
  p.innerHTML =
    '<h2>' + svgIcon('layers') + ' منظّم المحتوى</h2>' +
    '<p class="hint">عرض المادة ← الوحدة ← الدرس في مكان واحد. استخدمه للإضافة السريعة، البحث، النسخ أو الوصول المباشر إلى محتوى أي درس.</p>' +
    '<div class="organizer-head">' +
      '<div class="organizer-stats">' +
        '<span>' + svgIcon('book') + ' ' + data.subjects.length + ' مادة</span>' +
        '<span>' + svgIcon('layers') + ' ' + data.units.length + ' وحدة</span>' +
        '<span>' + svgIcon('film') + ' ' + data.lessons.length + ' درس</span>' +
      '</div>' +
      '<button type="button" class="btn btn-primary" id="buildPathBtn">' + svgIcon('sparkles') + ' بناء مادة ووحدة ودرس</button>' +
    '</div>' +
    '<div class="organizer-search"><span>' + svgIcon('search') + '</span><input id="organizerSearch" type="search" placeholder="ابحث باسم مادة أو وحدة أو درس…" autocomplete="off"></div>' +
    '<div class="content-tree" id="contentTree">' +
      (data.subjects.length ? data.subjects.slice().sort(byOrder).map(treeSubjectHTML).join('') : '<div class="empty">لا توجد مواد بعد — ابدأ ببناء أول مسار تعليمي.</div>') +
    '</div>';

  $('#buildPathBtn').addEventListener('click', openCreatePathDialog);
  var tree = $('#contentTree');
  tree.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-organizer-act]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var id = btn.dataset.id, action = btn.dataset.organizerAct;
    if (action === 'add-unit') openQuickUnitDialog(id);
    else if (action === 'add-lesson') openQuickLessonDialog(id);
    else if (action === 'manage-subject') { sel.subject = id; goToAdminTab('subjects'); }
    else if (action === 'manage-unit') {
      var unit = getUnit(data, id);
      if (unit) { sel.subject = unit.subjectId; sel.unit = id; sel.lesson = ''; goToAdminTab('units'); }
    } else if (action === 'manage-lesson') {
      var path = lessonPath(data, id);
      if (path && path.subject && path.unit) {
        sel.subject = path.subject.id; sel.unit = path.unit.id; sel.lesson = id; goToAdminTab('content');
      }
    } else if (action === 'preview-lesson') {
      window.open('lesson.html?lesson=' + encodeURIComponent(id), '_blank');
    } else if (action === 'copy-unit') {
      var unitToCopy = getUnit(data, id);
      if (unitToCopy && confirm('نسخ وحدة "' + unitToCopy.title + '" مع كل دروسها ومحتواها؟')) {
        duplicateUnit(id); renderPanel(); toast('تم إنشاء نسخة كاملة من الوحدة');
      }
    } else if (action === 'copy-subject') {
      var subjectToCopy = getSubject(data, id);
      if (subjectToCopy && confirm('نسخ مادة "' + subjectToCopy.name + '" بكامل وحداتها ودروسها ومحتواها؟')) {
        duplicateSubject(id); renderPanel(); toast('تم إنشاء نسخة كاملة من المادة');
      }
    }
  });

  var search = $('#organizerSearch');
  search.addEventListener('input', function () {
    var q = this.value.trim().toLocaleLowerCase();
    $all('.tree-subject', tree).forEach(function (subjectEl) {
      var subjectMatches = !q || subjectEl.querySelector('summary').textContent.toLocaleLowerCase().indexOf(q) !== -1;
      var visibleUnit = false;
      $all('.tree-unit', subjectEl).forEach(function (unitEl) {
        var unitMatches = subjectMatches || (!q || unitEl.querySelector('summary').textContent.toLocaleLowerCase().indexOf(q) !== -1);
        var visibleLesson = false;
        $all('.tree-lesson', unitEl).forEach(function (lessonEl) {
          var showLesson = unitMatches || !q || lessonEl.dataset.search.indexOf(q) !== -1;
          lessonEl.hidden = !showLesson;
          if (showLesson) visibleLesson = true;
        });
        var showUnit = unitMatches || visibleLesson;
        unitEl.hidden = !showUnit;
        if (showUnit) { visibleUnit = true; if (q) unitEl.open = true; }
      });
      subjectEl.hidden = !visibleUnit && !subjectMatches;
      if (q && !subjectEl.hidden) subjectEl.open = true;
    });
  });
}

/* ---------- لوحة المواد ---------- */
function renderSubjectsPanel(p) {
  var list = data.subjects.slice().sort(byOrder);

  p.innerHTML =
    '<h2>' + svgIcon('book') + ' إدارة المواد</h2>' +
    '<p class="hint">أضف مادة، وعدّل الاسم والأيقونة واللون وموضع العرض. استخدم «منظّم المحتوى» لبناء مسار كامل أو نسخ مادة بكل محتواها.</p>' +
    '<div class="frm-card">' +
      '<div class="frm-row">' +
        '<input class="inp" id="nsName" placeholder="اسم المادة (مثال: الرياضيات)">' +
        '<input class="inp" id="nsIcon" dir="ltr" placeholder="رابط صورة أو اسم أيقونة SVG (مثال: math)" style="flex:2 1 240px">' +
        '<div class="icon-preview" id="nsIconPreview">' + svgIcon('book') + '</div>' +
        '<select class="inp" id="nsColor">' + SUBJECT_COLORS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>' +
        '<button class="btn btn-primary" id="nsAdd">' + svgIcon('plus') + ' إضافة مادة</button>' +
      '</div>' +
    '</div>' +
    '<div class="admin-list" id="subjList">' +
      (list.length ? list.map(function (s) {
        var units = unitsOf(data, s.id);
        return '<div class="item-row c-' + (s.color || 'indigo') + '">' +
          '<div class="item-ico">' + iconHTML(s.icon, 'book') + '</div>' +
          '<div class="item-info"><div class="item-title">' + escapeHtml(s.name) + '</div>' +
          '<div class="item-sub">' + units.length + ' وحدة · ' + units.reduce(function (n, u) { return n + lessonsOf(data, u.id).length; }, 0) + ' درس</div></div>' +
          actsHTML(s.id, '<button class="icon-btn" data-act="copy" data-id="' + s.id + '" title="نسخ المادة بكل محتواها">' + svgIcon('copy') + '</button>') +
        '</div>';
      }).join('') : '<div class="empty">لا توجد مواد — أضف أول مادة أعلاه</div>') +
    '</div>';

  /* معاينة مباشرة للأيقونة أثناء الكتابة */
  $('#nsIcon').addEventListener('input', function () {
    $('#nsIconPreview').innerHTML = iconHTML(this.value, 'book');
  });

  $('#nsAdd').addEventListener('click', function () {
    var name = $('#nsName').value.trim();
    if (!name) { toast('اكتب اسم المادة', 'err'); return; }
    data.subjects.push({
      id: uid('s'), name: name,
      icon: $('#nsIcon').value.trim() || 'book', color: $('#nsColor').value,
      order: (data.subjects.reduce(function (m, s) { return Math.max(m, s.order || 0); }, 0) + 1)
    });
    save(); renderPanel(); toast('تمت إضافة المادة');
  });

  bindList($('#subjList'), {
    up: function (id) { moveItem(data.subjects, id, -1); renderPanel(); },
    down: function (id) { moveItem(data.subjects, id, 1); renderPanel(); },
    rename: function (id) {
      var s = getSubject(data, id);
      openEditDialog({
        title: 'تعديل المادة', icon: 'book',
        fields: [
          { key: 'name', label: 'اسم المادة', value: s.name, placeholder: 'مثال: الرياضيات' },
          { key: 'icon', label: 'الأيقونة — اسم SVG أو رابط صورة', type: 'icon', value: s.icon || '', placeholder: 'مثال: math أو https://...' },
          { key: 'color', label: 'اللون', type: 'select', value: s.color, options: colorOptions() },
          { key: 'order', label: 'موضع المادة في الترتيب', type: 'number', value: s.order || 1 }
        ],
        onSave: function (v) {
          s.name = v.name.trim() || s.name;
          s.icon = v.icon.trim() || 'book';
          s.color = v.color || 'indigo';
          setItemOrder(data.subjects, s.id, v.order);
          save(); renderPanel(); toast('تم حفظ تعديلات المادة');
        }
      });
    },
    copy: function (id) {
      var s = getSubject(data, id);
      if (s && confirm('إنشاء نسخة من مادة "' + s.name + '" مع كل الوحدات والدروس والمحتوى؟')) {
        duplicateSubject(id);
        renderPanel(); toast('تم إنشاء نسخة كاملة من المادة', 'info');
      }
    },
    del: function (id) {
      var s = getSubject(data, id);
      if (confirm('حذف مادة "' + s.name + '" مع كل وحداتها ودروسها ومحتواها؟')) {
        deleteCascade('subject', id);
        if (sel.subject === id) sel.subject = '';
        renderPanel(); toast('تم الحذف', 'info');
      }
    }
  });
}

/* ---------- لوحة الوحدات ---------- */
function renderUnitsPanel(p) {
  if (!sel.subject) { var s0 = data.subjects.slice().sort(byOrder)[0]; if (s0) sel.subject = s0.id; }
  var list = sel.subject ? unitsOf(data, sel.subject) : [];

  p.innerHTML =
    '<h2>' + svgIcon('layers') + ' إدارة الوحدات</h2>' +
    '<p class="hint">اختر المادة ثم أضف وحداتها التعليمية. من التعديل تستطيع نقل الوحدة لمادة أخرى وتحديد موضعها بدقة.</p>' +
    '<div class="frm-card">' +
      '<div class="frm-row">' +
        '<select class="inp" id="uSubject">' + subjectOptions(sel.subject) + '</select>' +
        '<input class="inp" id="uTitle" placeholder="عنوان الوحدة (مثال: النهايات والاتصال)">' +
        '<button class="btn btn-primary" id="uAdd">' + svgIcon('plus') + ' إضافة وحدة</button>' +
      '</div>' +
    '</div>' +
    '<div class="admin-list" id="unitList">' +
      (list.length ? list.map(function (u, i) {
        var ls = lessonsOf(data, u.id);
        return '<div class="item-row">' +
          '<div class="item-ico">' + (i + 1) + '</div>' +
          '<div class="item-info"><div class="item-title">' + escapeHtml(u.title) + '</div>' +
          '<div class="item-sub">' + ls.length + ' درس</div></div>' +
          actsHTML(u.id, '<button class="icon-btn" data-act="copy" data-id="' + u.id + '" title="إنشاء نسخة (مع دروسها)">' + svgIcon('copy') + '</button>') +
        '</div>';
      }).join('') : '<div class="empty">لا توجد وحدات في هذه المادة — أضف وحدة أعلاه</div>') +
    '</div>';

  $('#uSubject').addEventListener('change', function () { sel.subject = this.value; sel.unit = ''; sel.lesson = ''; renderPanel(); });

  $('#uAdd').addEventListener('click', function () {
    if (!sel.subject) { toast('اختر المادة أولاً', 'err'); return; }
    var t = $('#uTitle').value.trim();
    if (!t) { toast('اكتب عنوان الوحدة', 'err'); return; }
    data.units.push({
      id: uid('u'), subjectId: sel.subject, title: t,
      order: (unitsOf(data, sel.subject).reduce(function (m, u) { return Math.max(m, u.order || 0); }, 0) + 1)
    });
    save(); renderPanel(); toast('تمت إضافة الوحدة');
  });

  bindList($('#unitList'), {
    up: function (id) { moveItem(data.units.filter(function (u) { return u.subjectId === sel.subject; }), id, -1); renderPanel(); },
    down: function (id) { moveItem(data.units.filter(function (u) { return u.subjectId === sel.subject; }), id, 1); renderPanel(); },
    rename: function (id) {
      var u = getUnit(data, id);
      openEditDialog({
        title: 'تعديل الوحدة', icon: 'layers',
        fields: [
          { key: 'title', label: 'عنوان الوحدة', value: u.title },
          { key: 'subject', label: 'المادة (لنقل الوحدة إليها)', type: 'select', value: u.subjectId,
            options: data.subjects.slice().sort(byOrder).map(function (s) { return { value: s.id, label: s.name }; }) },
          { key: 'order', label: 'موضع الوحدة في الترتيب', type: 'number', value: u.order || 1 }
        ],
        onSave: function (v) {
          u.title = v.title.trim() || u.title;
          var target = getSubject(data, v.subject);
          var oldSubjectId = u.subjectId;
          if (target && target.id !== u.subjectId) {
            u.subjectId = target.id;
            normalizeOrders(data.units.filter(function (x) { return x.subjectId === oldSubjectId; }));
            sel.subject = target.id; sel.unit = ''; sel.lesson = '';
          }
          setItemOrder(data.units.filter(function (x) { return x.subjectId === u.subjectId; }), u.id, v.order);
          save(); renderPanel(); toast('تم حفظ تعديلات الوحدة');
        }
      });
    },
    copy: function (id) {
      var u = getUnit(data, id);
      if (confirm('إنشاء نسخة من وحدة "' + u.title + '" مع كل دروسها وفيديوهاتها وملفاتها؟')) {
        duplicateUnit(id);
        renderPanel(); toast('تم إنشاء نسخة كاملة من الوحدة', 'info');
      }
    },
    del: function (id) {
      var u = getUnit(data, id);
      if (confirm('حذف وحدة "' + u.title + '" مع كل دروسها ومحتواها؟')) {
        deleteCascade('unit', id);
        renderPanel(); toast('تم الحذف', 'info');
      }
    }
  });
}

/* ---------- لوحة الدروس ---------- */
function renderLessonsPanel(p) {
  if (!sel.subject) { var s0 = data.subjects.slice().sort(byOrder)[0]; if (s0) sel.subject = s0.id; }
  if (!sel.subject || !getUnit(data, sel.unit)) { sel.unit = (unitsOf(data, sel.subject)[0] || {}).id || ''; }
  var list = sel.unit ? lessonsOf(data, sel.unit) : [];

  p.innerHTML =
    '<h2>' + svgIcon('film') + ' إدارة الدروس</h2>' +
    '<p class="hint">اختر المادة ثم الوحدة وأضف الدروس.</p>' +
    '<div class="frm-card">' +
      '<div class="frm-row">' +
        '<select class="inp" id="lSubject">' + subjectOptions(sel.subject) + '</select>' +
        '<select class="inp" id="lUnit">' + unitOptions(sel.subject, sel.unit) + '</select>' +
        '<input class="inp" id="lTitle" placeholder="عنوان الدرس (مثال: نهاية دالة عند نقطة)">' +
        '<button class="btn btn-primary" id="lAdd">' + svgIcon('plus') + ' إضافة درس</button>' +
      '</div>' +
    '</div>' +
    '<div class="admin-list" id="lessonList">' +
      (list.length ? list.map(function (l, i) {
        var res = resourcesOf(data, l.id);
        return '<div class="item-row">' +
          '<div class="item-ico">' + (i + 1) + '</div>' +
          '<div class="item-info"><div class="item-title">' + escapeHtml(l.title) + '</div>' +
          '<div class="item-sub">' + res.length + ' عنصر محتوى</div></div>' +
          actsHTML(l.id, '<button class="icon-btn" data-act="copy" data-id="' + l.id + '" title="إنشاء نسخة">' + svgIcon('copy') + '</button>' +
                         '<button class="icon-btn" data-act="goto" data-id="' + l.id + '" title="إدارة المحتوى">' + svgIcon('plus') + '</button>' +
                         '<button class="icon-btn" data-act="view" data-id="' + l.id + '" title="معاينة الدرس">' + svgIcon('eye') + '</button>') +
        '</div>';
      }).join('') : '<div class="empty">لا توجد دروس في هذه الوحدة — أضف درساً أعلاه</div>') +
    '</div>';

  $('#lSubject').addEventListener('change', function () {
    sel.subject = this.value;
    sel.unit = (unitsOf(data, sel.subject)[0] || {}).id || '';
    sel.lesson = '';
    renderPanel();
  });
  $('#lUnit').addEventListener('change', function () { sel.unit = this.value; sel.lesson = ''; renderPanel(); });

  $('#lAdd').addEventListener('click', function () {
    if (!sel.unit) { toast('اختر الوحدة أولاً', 'err'); return; }
    var t = $('#lTitle').value.trim();
    if (!t) { toast('اكتب عنوان الدرس', 'err'); return; }
    data.lessons.push({
      id: uid('l'), unitId: sel.unit, title: t,
      order: (lessonsOf(data, sel.unit).reduce(function (m, l) { return Math.max(m, l.order || 0); }, 0) + 1)
    });
    save(); renderPanel(); toast('تمت إضافة الدرس');
  });

  bindList($('#lessonList'), {
    up: function (id) { moveItem(data.lessons.filter(function (l) { return l.unitId === sel.unit; }), id, -1); renderPanel(); },
    down: function (id) { moveItem(data.lessons.filter(function (l) { return l.unitId === sel.unit; }), id, 1); renderPanel(); },
    rename: function (id) {
      var l = getLesson(data, id);
      var unitOpts = [];
      data.subjects.slice().sort(byOrder).forEach(function (s) {
        unitsOf(data, s.id).forEach(function (u) {
          unitOpts.push({ value: u.id, label: s.name + ' — ' + u.title });
        });
      });
      openEditDialog({
        title: 'تعديل الدرس', icon: 'film',
        fields: [
          { key: 'title', label: 'عنوان الدرس', value: l.title },
          { key: 'unit', label: 'الوحدة (لنقل الدرس إليها)', type: 'select', value: l.unitId, options: unitOpts },
          { key: 'order', label: 'موضع الدرس في الترتيب', type: 'number', value: l.order || 1 }
        ],
        onSave: function (v) {
          l.title = v.title.trim() || l.title;
          var targetUnit = getUnit(data, v.unit);
          var oldUnitId = l.unitId;
          if (targetUnit && targetUnit.id !== l.unitId) {
            l.unitId = targetUnit.id;
            normalizeOrders(data.lessons.filter(function (x) { return x.unitId === oldUnitId; }));
            sel.subject = targetUnit.subjectId; sel.unit = targetUnit.id; sel.lesson = l.id;
          }
          setItemOrder(data.lessons.filter(function (x) { return x.unitId === l.unitId; }), l.id, v.order);
          save(); renderPanel(); toast('تم حفظ تعديلات الدرس');
        }
      });
    },
    copy: function (id) {
      duplicateLesson(id);
      renderPanel(); toast('تم إنشاء نسخة من الدرس مع محتواه', 'info');
    },
    del: function (id) {
      var l = getLesson(data, id);
      if (confirm('حذف درس "' + l.title + '" مع كل محتواه (فيديوهات، ملفات، تمارين)؟')) {
        deleteCascade('lesson', id);
        renderPanel(); toast('تم الحذف', 'info');
      }
    },
    view: function (id) { window.open('lesson.html?lesson=' + encodeURIComponent(id), '_blank'); },
    goto: function (id) {
      sel.lesson = id;
      currentTab = 'content';
      $all('.tab').forEach(function (x) { x.classList.toggle('active', x.dataset.tab === 'content'); });
      renderPanel();
    }
  });
}

/* ---------- لوحة المحتوى (فيديو / ملفات / تمارين) ---------- */
function renderContentPanel(p) {
  if (!sel.subject) { var s0 = data.subjects.slice().sort(byOrder)[0]; if (s0) sel.subject = s0.id; }
  if (!sel.subject || !getUnit(data, sel.unit)) sel.unit = (unitsOf(data, sel.subject)[0] || {}).id || '';
  if (!sel.unit || !getLesson(data, sel.lesson)) sel.lesson = (lessonsOf(data, sel.unit)[0] || {}).id || '';

  var lesson = getLesson(data, sel.lesson);

  p.innerHTML =
    '<h2>' + svgIcon('plus') + ' إضافة المحتوى</h2>' +
    '<p class="hint">اختر المادة ← الوحدة ← الدرس، ثم أضف الفيديوهات والملفات والتمارين.</p>' +

    '<div class="frm-card">' +
      '<div class="frm-row">' +
        '<select class="inp" id="cSubject">' + subjectOptions(sel.subject) + '</select>' +
        '<select class="inp" id="cUnit">' + unitOptions(sel.subject, sel.unit) + '</select>' +
        '<select class="inp" id="cLesson">' + lessonOptions(sel.unit, sel.lesson) + '</select>' +
        '<a class="btn" href="lesson.html?lesson=' + encodeURIComponent(sel.lesson) + '" target="_blank">' + svgIcon('eye') + ' معاينة الدرس</a>' +
      '</div>' +
    '</div>' +
    '<div id="resArea"></div>';

  $('#cSubject').addEventListener('change', function () {
    sel.subject = this.value;
    sel.unit = (unitsOf(data, sel.subject)[0] || {}).id || '';
    sel.lesson = (lessonsOf(data, sel.unit)[0] || {}).id || '';
    renderPanel();
  });
  $('#cUnit').addEventListener('change', function () {
    sel.unit = this.value;
    sel.lesson = (lessonsOf(data, sel.unit)[0] || {}).id || '';
    renderPanel();
  });
  $('#cLesson').addEventListener('change', function () { sel.lesson = this.value; renderPanel(); });

  if (!lesson) {
    $('#resArea').innerHTML = '<div class="empty">لا توجد دروس — أنشئ درساً أولاً من تبويب «الدروس»</div>';
    return;
  }

  renderResourceSections($('#resArea'), lesson);
}

function renderResourceSections(area, lesson) {
  pickedFiles = {}; /* تصفير الملفات المختارة عند كل إعادة رسم */
  area.innerHTML =
    resSectionHTML(lesson, 'video', 'الفيديوهات', 'video/*', 'رابط الفيديو (MP4/WebM/OGG أو رابط يوتيوب)') +
    resSectionHTML(lesson, 'pdf', 'ملفات PDF', 'application/pdf,.pdf', 'رابط ملف PDF (https://...)') +
    resSectionHTML(lesson, 'image', 'الصور', 'image/*', 'رابط الصورة (https://...)') +
    exSectionHTML(lesson);

  bindFilePickers(area);

  /* ربط أزرار الإضافة */
  ['video', 'pdf', 'image'].forEach(function (kind) {
    $('#add-' + kind, area).addEventListener('click', function () {
      addResource(area, lesson, kind, null);
    });
  });
  $('#add-exercise', area).addEventListener('click', function () {
    addResource(area, lesson, 'exercise', $('#ex-type', area).value);
  });

  /* ربط القوائم */
  ['video', 'pdf', 'image', 'exercise'].forEach(function (kind) {
    bindList($('#list-' + kind, area), {
      up: function (id) { moveItem(resourcesOf(data, lesson.id, kind), id, -1); renderResourceSections(area, lesson); },
      down: function (id) { moveItem(resourcesOf(data, lesson.id, kind), id, 1); renderResourceSections(area, lesson); },
      rename: function (id) {
        var r = data.resources.find(function (x) { return x.id === id; });
        var fields = [
          { key: 'title', label: 'العنوان الظاهر للطلاب', value: r.title || '', placeholder: 'مثال: ملخص الدرس الأول' },
          { key: 'url', label: 'الرابط', value: r.url, dir: 'ltr', placeholder: 'https://... أو اتركه كما هو للملفات المرفوعة' },
          { key: 'order', label: 'موضعه في ترتيب هذا النوع', type: 'number', value: r.order || 1 }
        ];
        if (r.kind === 'exercise') {
          fields.push({ key: 'type', label: 'نوع التمرين', type: 'select', value: r.exerciseType || 'pdf',
            options: [
              { value: 'pdf', label: 'ملف PDF' },
              { value: 'video', label: 'فيديو (يُشغَّل في المشغل)' },
              { value: 'link', label: 'رابط موقع' }
            ] });
        }
        openEditDialog({
          title: 'تعديل ' + KIND_META[r.kind].label, icon: KIND_META[r.kind].icon,
          fields: fields,
          onSave: function (v) {
            if (v.title.trim()) r.title = v.title.trim();
            if (v.url.trim()) r.url = v.url.trim();
            if (r.kind === 'exercise') r.exerciseType = v.type;
            setItemOrder(resourcesOf(data, lesson.id, r.kind), r.id, v.order);
            save(); renderResourceSections(area, lesson); toast('تم حفظ التعديلات');
          }
        });
      },
      copy: function (id) { openCopyResourceDialog(id, area, lesson); },
      view: function (id) { previewResource(id); },
      del: function (id) {
        var r = data.resources.find(function (x) { return x.id === id; });
        if (r && confirm('حذف "' + (r.title || KIND_META[r.kind].label) + '"؟')) {
          deleteCascade('resource', id);
          renderResourceSections(area, lesson);
          toast('تم الحذف', 'info');
        }
      }
    });
  });
}

/* معاينة المورد من لوحة الإدارة من دون إظهار رابطه في الواجهة العامة. */
function previewResource(id) {
  var r = data.resources.find(function (x) { return x.id === id; });
  if (!r) return;
  resolveSrc(r.url).then(function (res) {
    if (res.kind === 'error') { toast(res.message || 'الملف غير متاح', 'err'); return; }
    if (res.kind === 'youtube') window.open('https://www.youtube.com/watch?v=' + res.id, '_blank');
    else window.open(res.src, '_blank', 'noopener');
  });
}

/* نسخ فيديو أو ملف أو تمرين إلى درس آخر مع الاحتفاظ بعنوانه ونوعه وترتيبه. */
function openCopyResourceDialog(id, area, currentLesson) {
  var resource = data.resources.find(function (x) { return x.id === id; });
  if (!resource) return;
  var options = data.lessons.slice().sort(byOrder).map(function (lesson) {
    var path = lessonPath(data, lesson.id);
    var label = (path.subject ? path.subject.name : 'مادة') + ' — ' +
      (path.unit ? path.unit.title : 'وحدة') + ' — ' + lesson.title;
    return { value: lesson.id, label: label };
  });
  openEditDialog({
    title: 'نسخ ' + (resource.title || KIND_META[resource.kind].label), icon: 'copy',
    fields: [{ key: 'lesson', label: 'الدرس المستهدف', type: 'select', value: currentLesson.id, options: options }],
    onSave: function (v) {
      var target = getLesson(data, v.lesson);
      if (!target) { toast('اختر درساً صالحاً', 'err'); return; }
      var maxOrder = resourcesOf(data, target.id, resource.kind).reduce(function (m, r) { return Math.max(m, r.order || 0); }, 0);
      data.resources.push({
        id: uid('r'), lessonId: target.id, kind: resource.kind, title: resource.title || '',
        url: resource.url, size: resource.size || undefined, exerciseType: resource.exerciseType || undefined,
        order: maxOrder + 1
      });
      save();
      if (target.id === currentLesson.id) renderResourceSections(area, currentLesson);
      toast('تم نسخ المحتوى إلى الدرس المختار');
    }
  });
}

function resSectionHTML(lesson, kind, title, accept, urlPlaceholder) {
  var meta = KIND_META[kind];
  var items = resourcesOf(data, lesson.id, kind);

  return '<h3 class="sub-title">' + svgIcon(meta.icon) + ' ' + title +
      ' <span class="cnt">' + items.length + '</span></h3>' +
    '<div class="frm-card">' +
      '<div class="frm-row">' +
        '<input class="inp" data-title="' + kind + '" placeholder="العنوان (مثال: الجزء الأول)">' +
        '<input class="inp" data-url="' + kind + '" dir="ltr" placeholder="' + urlPlaceholder + '">' +
        fileLabelHTML(kind, accept) +
        '<button class="btn btn-primary" id="add-' + kind + '">' + svgIcon('plus') + ' إضافة</button>' +
      '</div>' +
    '</div>' +
    '<div class="admin-list" id="list-' + kind + '">' +
      (items.length ? items.map(function (r) { return resRowHTML(r); }).join('')
        : '<div class="empty">لا يوجد محتوى من هذا النوع بعد</div>') +
    '</div>';
}

function exSectionHTML(lesson) {
  var items = resourcesOf(data, lesson.id, 'exercise');
  return '<h3 class="sub-title">' + svgIcon('pencil') + ' التمارين <span class="cnt">' + items.length + '</span></h3>' +
    '<div class="frm-card">' +
      '<div class="frm-row">' +
        '<input class="inp" data-title="exercise" placeholder="عنوان التمرين (مثال: سلسلة تمارين رقم 1)">' +
        '<select class="inp" id="ex-type">' +
          '<option value="pdf">تمرين PDF</option>' +
          '<option value="video">تمرين فيديو (يُشغَّل في المشغل)</option>' +
          '<option value="link">رابط موقع</option>' +
        '</select>' +
        '<input class="inp" data-url="exercise" dir="ltr" placeholder="الرابط (أو ارفع ملفاً)">' +
        fileLabelHTML('exercise', 'video/*,application/pdf,.pdf') +
        '<button class="btn btn-primary" id="add-exercise">' + svgIcon('plus') + ' إضافة</button>' +
      '</div>' +
    '</div>' +
    '<div class="admin-list" id="list-exercise">' +
      (items.length ? items.map(function (r) { return resRowHTML(r); }).join('')
        : '<div class="empty">لا توجد تمارين بعد</div>') +
    '</div>';
}

function resRowHTML(r) {
  var meta = KIND_META[r.kind];
  var src, rtl = false;
  if (isSbUrl(r.url)) { src = svgIcon('cloud') + ' ملف في السحابة' + (r.size ? ' (' + fmtSize(r.size) + ')' : ''); rtl = true; }
  else if (isIdbUrl(r.url)) { src = svgIcon('folder') + ' ملف مرفوع' + (r.size ? ' (' + fmtSize(r.size) + ')' : ''); rtl = true; }
  else if (youtubeId(r.url)) { src = svgIcon('film') + ' يوتيوب'; rtl = true; }
  else { src = svgIcon('link') + ' رابط خارجي'; rtl = true; }

  var typeLbl = r.kind === 'exercise' && r.exerciseType
    ? ' — ' + ({ video: 'فيديو', pdf: 'PDF', link: 'رابط' }[r.exerciseType])
    : '';

  return '<div class="item-row">' +
    '<div class="item-ico">' + svgIcon(meta.icon) + '</div>' +
    '<div class="item-info"><div class="item-title">' + escapeHtml(r.title || meta.label) + typeLbl + '</div>' +
    '<div class="item-sub"' + (rtl ? ' dir="rtl" style="text-align:right"' : '') + '>' + src + '</div></div>' +
    actsHTML(r.id, '<button class="icon-btn" data-act="view" data-id="' + r.id + '" title="معاينة">' + svgIcon('eye') + '</button>' +
                    '<button class="icon-btn" data-act="copy" data-id="' + r.id + '" title="نسخ إلى درس آخر">' + svgIcon('copy') + '</button>') +
  '</div>';
}

function addResource(area, lesson, kind, exerciseType) {
  var titleInp = $('input[data-title="' + kind + '"]', area);
  var urlInp = $('input[data-url="' + kind + '"]', area);
  var title = titleInp.value.trim();
  var url = urlInp.value.trim();
  var file = pickedFiles[kind] || null;

  if (!file && !url) { toast('الصق رابطاً أو اختر ملفاً للرفع', 'err'); return; }

  var maxOrder = resourcesOf(data, lesson.id, kind).reduce(function (m, r) { return Math.max(m, r.order || 0); }, 0);

  if (file) {
    filePut(file).then(function (fid) {
      data.resources.push({
        id: uid('r'), lessonId: lesson.id, kind: kind,
        title: title || file.name.replace(/\.[^.]+$/, ''),
        url: fid, size: file.size,
        exerciseType: exerciseType || undefined,
        order: maxOrder + 1
      });
      save();
      titleInp.value = ''; urlInp.value = '';
      clearPick(kind);
      renderResourceSections(area, lesson);
      toast('تم رفع الملف وإضافته');
    }).catch(function () {
      toast('تعذّر رفع الملف (مساحة غير كافية؟)', 'err');
    });
  } else {
    data.resources.push({
      id: uid('r'), lessonId: lesson.id, kind: kind,
      title: title || guessFileName(url),
      url: url,
      exerciseType: exerciseType || undefined,
      order: maxOrder + 1
    });
    save();
    titleInp.value = ''; urlInp.value = '';
    renderResourceSections(area, lesson);
    toast('تمت الإضافة');
  }
}

/* ---------- لوحة النسخ الاحتياطي ---------- */
function renderBackupPanel(p) {
  var cloudBox;
  if (isCloudMode()) {
    cloudBox =
      '<div class="frm-card">' +
        '<h3 class="sub-title" style="margin-top:0">' + svgIcon('cloud') + ' السحابة (Supabase) — <span style="color:var(--ok)">متصلة</span></h3>' +
        '<p class="hint">كل تعديل تُجريه هنا يُحفَظ تلقائياً في السحابة ويظهر لجميع زوار الموقع.</p>' +
        '<div class="frm-row">' +
          '<button class="btn btn-primary" id="syncNowBtn">' + svgIcon('refresh') + ' مزامنة الآن</button>' +
          '<button class="btn" id="reloadCloudBtn">' + svgIcon('cloud') + ' إعادة التحميل من السحابة</button>' +
        '</div>' +
      '</div>';
  } else {
    cloudBox =
      '<div class="frm-card">' +
        '<h3 class="sub-title" style="margin-top:0">' + svgIcon('cloud-off') + ' السحابة (Supabase) — <span style="color:#ffc75d">غير متصلة</span></h3>' +
        '<p class="hint">' +
          (typeof Cloud !== 'undefined' && Cloud.setupMissing
            ? 'أنشئ الجداول بتنفيذ ملف <b>supabase-setup.sql</b> في SQL Editor داخل لوحة Supabase (انظر التنبيه أعلى الصفحة).'
            : 'تعذّر الوصول إلى Supabase حالياً — المحتوى يُحفَظ محلياً وسيُزامَن تلقائياً عند عودة الاتصال.') +
        '</p>' +
      '</div>';
  }

  p.innerHTML =
    '<h2>' + svgIcon('save') + ' النسخ الاحتياطي والاستعادة</h2>' +
    '<p class="hint">صدّر كل بيانات الموقع (المواد، الوحدات، الدروس، الروابط) في ملف واحد، أو استوردها على جهاز آخر.</p>' +

    cloudBox +

    '<div class="note-box">' + svgIcon('alert') + ' ملاحظة: الملفات المرفوعة في الوضع المحلي (بدون سحابة) تُخزَّن داخل متصفحك ولا تُصدَّر مع النسخة الاحتياطية — ' +
    'عند اتصال Supabase تُرفع الملفات إلى السحابة وتكون متاحة للجميع.</div>' +

    '<div class="frm-card">' +
      '<div class="frm-row">' +
        '<button class="btn btn-primary" id="exportBtn">' + svgIcon('download') + ' تصدير نسخة احتياطية (JSON)</button>' +
        '<label class="btn file-label">' + svgIcon('upload') + ' استيراد نسخة احتياطية<input type="file" id="importFile" accept="application/json,.json"></label>' +
        '<button class="btn btn-danger" id="resetBtn">' + svgIcon('refresh') + ' إعادة تعيين الموقع (حذف كل التعديلات)</button>' +
      '</div>' +
    '</div>' +

    '<div class="frm-card">' +
      '<h3 class="sub-title" style="margin-top:0">' + svgIcon('chart') + ' إحصائيات الموقع</h3>' +
      '<div class="item-sub" style="direction:rtl">' +
        svgIcon('book') + ' ' + data.subjects.length + ' مادة · ' + svgIcon('layers') + ' ' + data.units.length + ' وحدة · ' +
        svgIcon('film') + ' ' + data.lessons.length + ' درس · ' + svgIcon('plus') + ' ' + data.resources.length + ' عنصر محتوى' +
      '</div>' +
    '</div>';

  var syncBtn = $('#syncNowBtn');
  if (syncBtn) syncBtn.addEventListener('click', function () {
    Cloud.syncAll(data).then(function () {
      toast(Cloud.lastError ? 'فشلت المزامنة — حاول مجدداً' : 'تمت المزامنة مع السحابة', Cloud.lastError ? 'err' : 'ok');
    });
  });
  var reloadBtn = $('#reloadCloudBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', function () {
    Cloud.loadAll().then(function (d) {
      data = d;
      window.CLOUD_DATA = d;
      sel = { subject: '', unit: '', lesson: '' };
      renderPanel();
      toast('تم تحميل أحدث نسخة من السحابة');
    }).catch(function () {
      toast('تعذّر التحميل من السحابة', 'err');
    });
  });

  $('#exportBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var objUrl = URL.createObjectURL(blob);
    a.href = objUrl;
    a.download = 'aya-bac-2027-backup.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(objUrl); }, 8000);
    toast('تم تنزيل النسخة الاحتياطية');
  });

  $('#importFile').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var d = JSON.parse(reader.result);
        if (!d || !Array.isArray(d.subjects) || !Array.isArray(d.units) ||
            !Array.isArray(d.lessons) || !Array.isArray(d.resources)) throw new Error('bad');
        if (!confirm('سيتم استبدال كل المحتوى الحالي بمحتوى النسخة الاحتياطية. متابعة؟')) return;
        data = d;
        save();
        toast('تم الاستيراد بنجاح');
        sel = { subject: '', unit: '', lesson: '' };
        renderPanel();
      } catch (e) {
        toast('الملف غير صالح', 'err');
      }
    };
    reader.readAsText(f);
  });

  $('#resetBtn').addEventListener('click', function () {
    if (confirm('سيتم حذف كل التعديلات والعودة للمحتوى الافتراضي' +
        (isCloudMode() ? ' (في السحابة أيضاً)' : '') + '. متابعة؟')) {
      data = resetData();
      window.CLOUD_DATA = data;
      save(); /* في الوضع السحابي: يُعاد ضبط السحابة أيضاً */
      sel = { subject: '', unit: '', lesson: '' };
      renderPanel();
      updateCloudBadge();
      toast('تمت إعادة التعيين', 'info');
    }
  });
}
