/* ============================================================
   آية باك 2027 — لوحة التحكم (إدارة كل محتوى الموقع)
   ============================================================ */
'use strict';

/* تفعيل وضع الإدارة لكي تعرض دوال الجلب كل العناصر بما فيها المخفية عن الطلاب */
window.AYA_ADMIN_MODE = true;

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
var sel = { subject: '', unit: '', lesson: '', exercise: '' };
var pickedFiles = {}; /* ملفات مختارة مؤقتاً في نماذج الإضافة: pickedFiles[key] = File */
var adminOpenSections = {}; /* حفظ الأقسام المفتوحة لكل درس/تمرين (الأول مفتوح افتراضياً والبقية مطوية بسهم) */
var adminOpenGroups = {};   /* حفظ المجموعات المفتوحة (المجموعة الأولى مفتوحة افتراضياً والبقية مطوية بسهم) */
var adminOpenUnits = {};    /* حفظ الوحدات المفتوحة في لوحة الوحدات (الوحدة الأولى مفتوحة افتراضياً) */
var adminOpenLessons = {};  /* حفظ الدروس المفتوحة في لوحة الدروس (الدرس الأول مفتوح افتراضياً والبقية مطوية بسهم) */

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

    /* رابط مباشر لتبويب معين مثل admin.html?tab=ai أو درس/تمرين admin.html?lesson=xxx */
    var requestedTab = param('tab');
    var targetItemId = param('exercise') || param('lesson');
    if (targetItemId && getLesson(data, targetItemId)) {
      var path = lessonPath(data, targetItemId);
      if (path.subject && path.unit) {
        sel.subject = path.subject.id;
        sel.unit = path.unit.id;
        if (path.isExercise) {
          sel.exercise = path.lesson.id;
          sel.lesson = (lessonsOf(data, sel.unit)[0] || {}).id || '';
          currentTab = 'exercises';
        } else {
          sel.lesson = path.lesson.id;
          sel.exercise = (unitExercisesOf(data, sel.unit)[0] || {}).id || '';
          currentTab = 'content';
        }
      }
    } else {
      var s0 = data.subjects.slice().sort(byOrder)[0];
      if (s0) sel.subject = s0.id;
      var u0 = s0 ? unitsOf(data, s0.id)[0] : null;
      if (u0) sel.unit = u0.id;
      var l0 = u0 ? lessonsOf(data, u0.id)[0] : null;
      if (l0) sel.lesson = l0.id;
      var ex0 = u0 ? unitExercisesOf(data, u0.id)[0] : null;
      if (ex0) sel.exercise = ex0.id;
      if (requestedTab && $('[data-tab="' + requestedTab + '"]')) {
        currentTab = requestedTab;
      }
    }
    $all('.tab').forEach(function (x) { x.classList.toggle('active', x.dataset.tab === currentTab); });

    var topSchedBtn = $('#topAdminSchedBtn');
    if (topSchedBtn) {
      topSchedBtn.addEventListener('click', function () {
        goToAdminTab('schedule');
      });
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
function unitExerciseOptions(unitId, selectedId) {
  var exs = unitId ? unitExercisesOf(data, unitId) : [];
  return '<option value="">— اختر التمرين —</option>' + exs.map(function (ex) {
    return '<option value="' + ex.id + '"' + (ex.id === selectedId ? ' selected' : '') + '>' + escapeHtml(ex.title) + '</option>';
  }).join('');
}

function hiddenPillHTML(isHidden) {
  return isHidden ? ' <span class="hidden-pill">' + svgIcon('eye-off') + ' مخفي عن الطلاب</span>' : '';
}

function hideBtnHTML(id, isHidden, titleShown, titleHidden) {
  return '<button class="icon-btn' + (isHidden ? ' is-hidden-btn' : '') + '" data-act="toggle-hide" data-id="' + id + '" title="' +
    escapeHtml(isHidden ? (titleHidden || 'إظهار للطلاب') : (titleShown || 'إخفاء مؤقتاً عن الطلاب')) + '">' +
    svgIcon(isHidden ? 'eye-off' : 'eye') + '</button>';
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

/* التقاط أزرار القوائم (تعديل/حذف/ترتيب/نسخ/إخفاء/توسيع) بشكل مركزي */
function bindList(container, handlers) {
  if (!container) return;
  container.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act, id = btn.dataset.id;
    if (act === 'up' && handlers.up) handlers.up(id);
    else if (act === 'down' && handlers.down) handlers.down(id);
    else if (act === 'rename' && handlers.rename) handlers.rename(id);
    else if (act === 'del' && handlers.del) handlers.del(id);
    else if (act === 'copy' && handlers.copy) handlers.copy(id);
    else if (act === 'copy-all-unit' && handlers.copyAllUnit) handlers.copyAllUnit(id);
    else if (act === 'copy-to-lessons' && handlers.copyToLessons) handlers.copyToLessons(id);
    else if (act === 'unit-manage' && handlers.unitManage) handlers.unitManage(id);
    else if (act === 'toggle-hide' && handlers.toggleHide) handlers.toggleHide(id);
    else if (act === 'toggle-open' && handlers.toggleOpen) handlers.toggleOpen(id);
    else if (act === 'coeff-inc' && handlers.coeffInc) handlers.coeffInc(id);
    else if (act === 'coeff-dec' && handlers.coeffDec) handlers.coeffDec(id);
    else if (act === 'view' && handlers.view) handlers.view(id);
    else if (act === 'goto' && handlers.goto) handlers.goto(id);
    else if (act === 'select' && handlers.select) handlers.select(id);
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
      var file = inp.files[0] || null;
      pickedFiles[key] = file;
      var lbl = $('[data-picked="' + key + '"]', root);
      if (lbl) lbl.innerHTML = file
        ? svgIcon('check') + ' ' + escapeHtml(file.name) + ' (' + fmtSize(file.size) + ')'
        : '';
      /* نملأ العنوان تلقائياً باسم الملف إن كان فارغاً */
      var titleInp = $('input[data-title="' + key + '"]', root);
      if (file && titleInp && !titleInp.value.trim()) {
        titleInp.value = file.name.replace(/\.[^.]+$/, '');
      }
      /* في قسم التمارين المرفقة بالدرس: نضبط نوع التمرين تلقائياً حسب نوع الملف المختار */
      if (file && key === 'exercise') {
        var exSel = $('#ex-type', root);
        if (exSel) {
          var mime = String(file.type || '').toLowerCase();
          var fname = String(file.name || '').toLowerCase();
          if (mime.indexOf('video/') === 0 || /\.(mp4|webm|ogg|mov|mkv)$/i.test(fname)) exSel.value = 'video';
          else if (mime.indexOf('image/') === 0 || /\.(png|jpe?g|webp|gif|svg)$/i.test(fname)) exSel.value = 'image';
          else if (mime === 'application/pdf' || /\.pdf$/i.test(fname)) exSel.value = 'pdf';
        }
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
  var groupMap = {};
  resourcesOf(data, sourceLessonId).forEach(function (r) {
    var mappedGroupId;
    if (r.groupId) {
      if (!groupMap[r.groupId]) groupMap[r.groupId] = uid('g');
      mappedGroupId = groupMap[r.groupId];
    }
    data.resources.push({
      id: uid('r'), lessonId: targetLessonId, kind: r.kind,
      title: r.title || '', url: r.url, size: r.size || undefined,
      exerciseType: r.exerciseType || undefined,
      groupId: mappedGroupId,
      groupTitle: r.groupTitle || undefined,
      order: r.order || 1
    });
  });
}

/* تحويل نوع المورد تلقائياً عند النسخ بين «تمرين مستقل في صفحة التمارين» و«درس عادي»:
   - من تمرين مستقل (video/pdf/image) إلى درس عادي -> يصبح kind='exercise' مع exerciseType مناسب ليظهر في «تمارين وتطبيقات» وليس في الصور التوضيحية.
   - من تمرين مرفق بدرس (kind='exercise') إلى تمرين مستقل -> يتحول إلى قسمه المقابل (image/pdf/video) في صفحة التمرين. */
function mapResourceKindForTarget(src, targetLesson) {
  var srcParent = src && src.lessonId ? getLesson(data, src.lessonId) : null;
  var srcIsEx = srcParent ? isExerciseItem(srcParent) : false;
  var targetIsEx = targetLesson ? isExerciseItem(targetLesson) : false;

  if (srcIsEx && !targetIsEx) {
    return {
      kind: 'exercise',
      exerciseType: src.kind === 'exercise' ? (src.exerciseType || 'image') : src.kind
    };
  }
  if (!srcIsEx && targetIsEx && src.kind === 'exercise') {
    var et = src.exerciseType || 'image';
    if (et === 'video' || et === 'pdf' || et === 'image') {
      return { kind: et, exerciseType: undefined };
    }
    return { kind: youtubeId(src.url) ? 'video' : 'pdf', exerciseType: undefined };
  }
  return {
    kind: src.kind,
    exerciseType: src.kind === 'exercise' ? (src.exerciseType || 'link') : undefined
  };
}

/* نسخ مورد واحد أو مجموعة موارد كاملة (عنوان + عدة صور/ملفات) إلى قائمة دروس/تمارين مستهدفة دون تكرار. */
function copyResourcesBundleToTargets(sourceItems, targets, opts) {
  opts = opts || {};
  var itemsList = Array.isArray(sourceItems) ? sourceItems : (sourceItems ? [sourceItems] : []);
  if (!itemsList.length) return { added: 0, updated: 0, targetsUpdated: 0, skipped: 0 };
  var added = 0, updated = 0, targetsUpdated = 0, skipped = 0;

  (targets || []).forEach(function (t) {
    if (!t || !t.id) return;
    var groupMap = {};
    var targetTouched = false;
    itemsList.forEach(function (src) {
      if (!src || t.id === src.lessonId) return;
      var mapped = mapResourceKindForTarget(src, t);
      var existing = resourcesOf(data, t.id, mapped.kind);
      var foundExisting = existing.find(function (x) {
        return x.url === src.url && (mapped.kind !== 'exercise' || (x.exerciseType || '') === (mapped.exerciseType || ''));
      });
      var mappedGroupId;
      if (src.groupId) {
        if (!groupMap[src.groupId]) groupMap[src.groupId] = uid('g');
        mappedGroupId = groupMap[src.groupId];
      }
      if (foundExisting) {
        if (opts.refreshExisting) {
          var nextTitle = src.title || foundExisting.title || '';
          var nextGroupTitle = src.groupTitle || undefined;
          if (foundExisting.title !== nextTitle || (foundExisting.groupTitle || undefined) !== nextGroupTitle || (mappedGroupId && !foundExisting.groupId)) {
            foundExisting.title = nextTitle;
            if (mappedGroupId) foundExisting.groupId = mappedGroupId;
            if (nextGroupTitle) foundExisting.groupTitle = nextGroupTitle;
            updated++;
            targetTouched = true;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
        return;
      }
      var maxOrder = existing.reduce(function (m, r) { return Math.max(m, r.order || 0); }, 0);
      data.resources.push({
        id: uid('r'),
        lessonId: t.id,
        kind: mapped.kind,
        title: src.title || '',
        url: src.url,
        size: src.size || undefined,
        exerciseType: mapped.exerciseType,
        groupId: mappedGroupId,
        groupTitle: src.groupTitle || undefined,
        order: maxOrder + 1
      });
      added++;
      targetTouched = true;
    });
    if (targetTouched) targetsUpdated++;
  });
  return { added: added, updated: updated, targetsUpdated: targetsUpdated, skipped: skipped };
}

/* جمع كل موارد تمرين مستقل مرتّبة حسب مجموعاتها الديناميكية (الصور ثم PDF ثم الفيديو) */
function orderedItemsOfStandaloneExercise(exId) {
  var out = [];
  ['image', 'pdf', 'video'].forEach(function (k) {
    var grps = groupResources(resourcesOf(data, exId, k));
    grps.forEach(function (g) {
      var gid = g.groupId || uid('g');
      var gTitle = g.title || '';
      g.items.forEach(function (it) {
        if (!it.groupId) it.groupId = gid;
        if (!it.groupTitle && gTitle) it.groupTitle = gTitle;
        out.push(it);
      });
    });
  });
  return out;
}

/* مزامنة تمرين واحد أو جميع تمارين الوحدة المستقلة إلى قسم «تمارين وتطبيقات» في جميع دروس الوحدة بالترتيب الدقيق دون تكرار */
function syncStandaloneExercisesToUnitLessons(unitId, specificExerciseId) {
  var targetLessons = lessonsOf(data, unitId);
  if (!targetLessons.length) {
    toast('لا توجد دروس في هذه الوحدة بعد لنسخ التمارين إليها', 'info');
    return { lessonsCount: 0, itemsCount: 0 };
  }
  var allUnitEx = unitExercisesOf(data, unitId);
  var exercisesToSync = specificExerciseId
    ? allUnitEx.filter(function (ex) { return ex.id === specificExerciseId; })
    : allUnitEx;

  var sourceItems = [];
  exercisesToSync.forEach(function (ex) {
    orderedItemsOfStandaloneExercise(ex.id).forEach(function (it) { sourceItems.push(it); });
  });

  if (!sourceItems.length) {
    toast('أضف محتوى (صور أو PDF أو فيديو) داخل التمرين أولاً ثم انسخه إلى الدروس', 'err');
    return { lessonsCount: 0, itemsCount: 0 };
  }

  /* عند مزامنة جميع تمارين الوحدة كاملةً نعيد بناء ترتيبها الدقيق في كل درس، مع الإبقاء على أي تمرين خاص بالدرس وحده */
  if (!specificExerciseId) {
    var syncedUrlSet = {};
    sourceItems.forEach(function (s) { if (s.url) syncedUrlSet[s.url] = true; });

    targetLessons.forEach(function (lesson) {
      /* تنظيف أي نسخ قديمة وضعت بالخطأ في الصور التوضيحية لنفس ملفات التمرين + إعادة ترتيب قسم التمارين */
      var customExItems = resourcesOf(data, lesson.id, 'exercise').filter(function (r) {
        return !syncedUrlSet[r.url];
      });
      data.resources = data.resources.filter(function (r) {
        if (r.lessonId !== lesson.id) return true;
        if (r.kind === 'exercise') return false;
        if (r.kind === 'image' && syncedUrlSet[r.url]) return false;
        return true;
      });

      var groupMap = {};
      var ord = 0;
      sourceItems.forEach(function (src) {
        ord++;
        var gid = src.groupId || ('auto-' + src.id);
        if (!groupMap[gid]) groupMap[gid] = uid('g');
        data.resources.push({
          id: uid('r'),
          lessonId: lesson.id,
          kind: 'exercise',
          title: src.title || src.groupTitle || '',
          url: src.url,
          size: src.size || undefined,
          exerciseType: src.kind === 'exercise' ? (src.exerciseType || 'image') : src.kind,
          groupId: groupMap[gid],
          groupTitle: src.groupTitle || src.title || undefined,
          order: ord
        });
      });

      customExItems.forEach(function (cItem) {
        ord++;
        cItem.order = ord;
        data.resources.push(cItem);
      });
    });

    save();
    return { lessonsCount: targetLessons.length, itemsCount: sourceItems.length };
  }

  /* عند نسخ تمرين واحد محدد: ننظف أي نسخة خاطئة في الصور التوضيحية وننسخ/نحدّث مجموعاته في قسم تمارين كل درس */
  var singleUrlSet = {};
  sourceItems.forEach(function (s) { if (s.url) singleUrlSet[s.url] = true; });
  targetLessons.forEach(function (lesson) {
    data.resources = data.resources.filter(function (r) {
      return !(r.lessonId === lesson.id && r.kind === 'image' && singleUrlSet[r.url]);
    });
  });
  var res = copyResourcesBundleToTargets(sourceItems, targetLessons, { refreshExisting: true });
  save();
  return { lessonsCount: targetLessons.length, itemsCount: sourceItems.length, updatedCount: res.targetsUpdated };
}

/* البحث عن كل النسخ المطابقة لمجموعة موارد أو تمرين داخل جميع دروس الوحدة */
function findMatchingResourcesAcrossUnitLessons(unitId, seedItems, groupTitle) {
  var unitLessonIds = {};
  lessonsOf(data, unitId, true).forEach(function (l) { unitLessonIds[l.id] = true; });
  var urlSet = {};
  (seedItems || []).forEach(function (it) { if (it && it.url) urlSet[it.url] = true; });
  var cleanTitle = String(groupTitle || '').trim();

  var matchedResources = data.resources.filter(function (r) {
    if (!unitLessonIds[r.lessonId]) return false;
    if (r.url && urlSet[r.url]) return true;
    if (cleanTitle && r.kind === 'exercise' && String(r.groupTitle || r.title || '').trim() === cleanTitle) return true;
    return false;
  });

  var touchedLessons = {};
  matchedResources.forEach(function (r) { touchedLessons[r.lessonId] = true; });
  return {
    resources: matchedResources,
    lessonsCount: Object.keys(touchedLessons).length
  };
}

/* إزالة نسخ تمرين مستقل من جميع دروس الوحدة (مع الإبقاء عليه داخل صفحة التمارين إن رغب المدير) */
function removeStandaloneExerciseFromUnitLessons(exId) {
  var ex = getLesson(data, exId);
  if (!ex) return { removedResources: 0, lessonsCount: 0 };
  var exItems = resourcesOf(data, exId, null, true);
  var found = findMatchingResourcesAcrossUnitLessons(ex.unitId, exItems, ex.title);
  if (!found.resources.length) return { removedResources: 0, lessonsCount: 0 };

  var idSet = {};
  var urlsToCheck = [];
  found.resources.forEach(function (r) {
    idSet[r.id] = true;
    if (r.url && urlsToCheck.indexOf(r.url) === -1) urlsToCheck.push(r.url);
  });
  data.resources = data.resources.filter(function (r) { return !idSet[r.id]; });
  lessonsOf(data, ex.unitId, true).forEach(function (l) {
    normalizeOrders(resourcesOf(data, l.id, 'exercise', true));
  });
  urlsToCheck.forEach(releaseFileIfUnused);
  save();
  return { removedResources: found.resources.length, lessonsCount: found.lessonsCount };
}

/* إخفاء أو إظهار نسخ تمرين مستقل داخل جميع دروس الوحدة دفعة واحدة */
function setStandaloneExerciseHiddenInUnitLessons(exId, hideFlag) {
  var ex = getLesson(data, exId);
  if (!ex) return { count: 0, lessonsCount: 0 };
  var exItems = resourcesOf(data, exId, null, true);
  var found = findMatchingResourcesAcrossUnitLessons(ex.unitId, exItems, ex.title);
  found.resources.forEach(function (r) { r.hidden = !!hideFlag; });
  if (found.resources.length) save();
  return { count: found.resources.length, lessonsCount: found.lessonsCount };
}

/* نافذة إدارة شاملة لتمرين في كل الدروس (إخفاء / إظهار / إزالة من كل الدروس / حذف نهائي) */
function openUnitExerciseManageDialog(exId) {
  var ex = getLesson(data, exId);
  if (!ex) return;
  var old = document.querySelector('.modal-overlay');
  if (old) old.remove();

  var exItems = resourcesOf(data, exId, null, true);
  var matchInfo = findMatchingResourcesAcrossUnitLessons(ex.unitId, exItems, ex.title);
  var hiddenInLessons = matchInfo.resources.length > 0 && matchInfo.resources.every(function (r) { return !!r.hidden; });

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" style="max-width:540px">' +
      '<h3>' + svgIcon('sliders') + ' إدارة التمرين: «' + escapeHtml(ex.title) + '»</h3>' +
      '<p class="hint" style="margin-top:-4px">تحكّم في ظهور هذا التمرين أو إزالته سواء في <b>صفحة التمارين</b> أو في <b>جميع دروس الوحدة</b> دفعة واحدة (' +
        (matchInfo.lessonsCount ? 'موجود حالياً في <b>' + matchInfo.lessonsCount + ' درس</b>' : 'غير منسوخ للدروس حالياً') + ').</p>' +
      '<div class="manage-choice-stack">' +
        '<button type="button" class="manage-choice-btn" data-mact="toggle-ex-page">' +
          '<span class="mc-ico">' + svgIcon(ex.hidden ? 'eye' : 'eye-off') + '</span>' +
          '<span class="mc-body"><strong>' + (ex.hidden ? 'إظهار التمرين في صفحة التمارين' : 'إخفاء التمرين مؤقتاً من صفحة التمارين') + '</strong>' +
          '<small>' + (ex.hidden ? 'التمرين مخفي حالياً عن الطلاب في قسم تمارين الوحدة' : 'يختفي عن الطلاب دون حذف ملفاته ويمكنك إظهاره لاحقاً') + '</small></span>' +
        '</button>' +
        (matchInfo.resources.length
          ? '<button type="button" class="manage-choice-btn" data-mact="toggle-in-lessons">' +
              '<span class="mc-ico">' + svgIcon(hiddenInLessons ? 'eye' : 'eye-off') + '</span>' +
              '<span class="mc-body"><strong>' + (hiddenInLessons ? 'إظهار التمرين في جميع دروس الوحدة (' + matchInfo.lessonsCount + ' درس)' : 'إخفاء التمرين من جميع دروس الوحدة (' + matchInfo.lessonsCount + ' درس)') + '</strong>' +
              '<small>تبديل الظهور داخل قسم «تمارين وتطبيقات» في كل الدروس دفعة واحدة</small></span>' +
            '</button>' +
            '<button type="button" class="manage-choice-btn warn" data-mact="remove-from-lessons">' +
              '<span class="mc-ico">' + svgIcon('trash') + '</span>' +
              '<span class="mc-body"><strong>إزالة هذا التمرين من كل دروس الوحدة فقط (' + matchInfo.lessonsCount + ' درس)</strong>' +
              '<small>يحذف النسخ الموجودة داخل الدروس مع الإبقاء على التمرين محفوظاً في صفحة التمارين</small></span>' +
            '</button>'
          : '') +
        '<button type="button" class="manage-choice-btn danger" data-mact="delete-everywhere">' +
          '<span class="mc-ico">' + svgIcon('trash') + '</span>' +
          '<span class="mc-body"><strong>حذف التمرين نهائياً (من صفحة التمارين + من كل الدروس)</strong>' +
          '<small>يحذف التمرين وجميع صوره وملفاته من الوحدة بالكامل</small></span>' +
        '</button>' +
      '</div>' +
      '<div class="acts" style="margin-top:14px">' +
        '<button type="button" class="btn" data-close>' + svgIcon('x') + ' إغلاق</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

  overlay.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mact]');
    if (!b) return;
    var act = b.dataset.mact;
    if (act === 'toggle-ex-page') {
      ex.hidden = !ex.hidden;
      save(); close(); renderPanel();
      toast(ex.hidden ? 'تم إخفاء التمرين عن الطلاب في صفحة التمارين' : 'تم إظهار التمرين للطلاب');
    } else if (act === 'toggle-in-lessons') {
      var resH = setStandaloneExerciseHiddenInUnitLessons(ex.id, !hiddenInLessons);
      close(); renderPanel();
      toast((!hiddenInLessons ? 'تم إخفاء التمرين في ' : 'تم إظهار التمرين في ') + resH.lessonsCount + ' درس بالوحدة');
    } else if (act === 'remove-from-lessons') {
      if (!confirm('تأكيد إزالة تمرين «' + ex.title + '» من جميع دروس الوحدة (' + matchInfo.lessonsCount + ' درس) مع بقائه في صفحة التمارين؟')) return;
      var rem = removeStandaloneExerciseFromUnitLessons(ex.id);
      close(); renderPanel();
      toast('تمت إزالة التمرين من ' + rem.lessonsCount + ' درس في الوحدة', 'info');
    } else if (act === 'delete-everywhere') {
      if (!confirm('حذف التمرين «' + ex.title + '» نهائياً من صفحة التمارين ومن جميع دروس الوحدة؟')) return;
      removeStandaloneExerciseFromUnitLessons(ex.id);
      deleteCascade('lesson', ex.id);
      if (sel.exercise === ex.id) sel.exercise = '';
      close(); renderPanel();
      toast('تم حذف التمرين نهائياً من الوحدة وكل دروسها', 'info');
    }
  });
}

/* نافذة إدارة فقرة/مجموعة محددة عبر كل دروس الوحدة (إخفاء / إظهار / إزالة من كل الدروس) */
function openGroupUnitManageDialog(targetGroup, currentLesson, kind, area, opts) {
  if (!targetGroup || !currentLesson) return;
  var old = document.querySelector('.modal-overlay');
  if (old) old.remove();

  var gTitle = targetGroup.title || KIND_META[kind].label;
  var matchInfo = findMatchingResourcesAcrossUnitLessons(currentLesson.unitId, targetGroup.items, gTitle);
  var allGroupHiddenLocal = targetGroup.allHidden;
  var allHiddenUnitWide = matchInfo.resources.length > 0 && matchInfo.resources.every(function (r) { return !!r.hidden; });

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" style="max-width:540px">' +
      '<h3>' + svgIcon('sliders') + ' خيارات الإخفاء والحذف: «' + escapeHtml(gTitle) + '»</h3>' +
      '<p class="hint" style="margin-top:-4px">تحكّم في هذه الفقرة داخل العنصر الحالي أو عبر <b>جميع دروس الوحدة</b> دفعة واحدة (' +
        (matchInfo.lessonsCount ? 'موجودة في <b>' + matchInfo.lessonsCount + ' درس</b> بالوحدة' : 'موجودة في هذا الموضع فقط') + ').</p>' +
      '<div class="manage-choice-stack">' +
        '<button type="button" class="manage-choice-btn" data-gmact="toggle-local">' +
          '<span class="mc-ico">' + svgIcon(allGroupHiddenLocal ? 'eye' : 'eye-off') + '</span>' +
          '<span class="mc-body"><strong>' + (allGroupHiddenLocal ? 'إظهار هذا العنوان في هذه الصفحة' : 'إخفاء هذا العنوان مؤقتاً في هذه الصفحة') + '</strong>' +
          '<small>يخفي أو يظهر «' + escapeHtml(gTitle) + '» هنا فقط دون المساس ببقية الدروس</small></span>' +
        '</button>' +
        (matchInfo.resources.length > 0
          ? '<button type="button" class="manage-choice-btn" data-gmact="toggle-unit">' +
              '<span class="mc-ico">' + svgIcon(allHiddenUnitWide ? 'eye' : 'eye-off') + '</span>' +
              '<span class="mc-body"><strong>' + (allHiddenUnitWide ? 'إظهار «' + escapeHtml(gTitle) + '» في كل دروس الوحدة (' + matchInfo.lessonsCount + ' درس)' : 'إخفاء «' + escapeHtml(gTitle) + '» من كل دروس الوحدة (' + matchInfo.lessonsCount + ' درس)') + '</strong>' +
              '<small>تطبيق الإخفاء أو الإظهار على جميع الدروس في الوحدة بنقرة واحدة</small></span>' +
            '</button>' +
            '<button type="button" class="manage-choice-btn danger" data-gmact="delete-unit">' +
              '<span class="mc-ico">' + svgIcon('trash') + '</span>' +
              '<span class="mc-body"><strong>إزالة وحذف «' + escapeHtml(gTitle) + '» من جميع دروس الوحدة (' + matchInfo.lessonsCount + ' درس)</strong>' +
              '<small>يحذف هذه الفقرة من قسم التمارين/المحتوى في كل دروس الوحدة دفعة واحدة' +
                (isExerciseItem(currentLesson) ? ' (مع بقائها في صفحة التمرين الحالية)' : '') + '</small></span>' +
            '</button>'
          : '') +
      '</div>' +
      '<div class="acts" style="margin-top:14px">' +
        '<button type="button" class="btn" data-close>' + svgIcon('x') + ' إغلاق</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

  overlay.addEventListener('click', function (e) {
    var b = e.target.closest('[data-gmact]');
    if (!b) return;
    var act = b.dataset.gmact;
    if (act === 'toggle-local') {
      var nextH = !allGroupHiddenLocal;
      targetGroup.items.forEach(function (it) { it.hidden = nextH; });
      save(); close();
      renderResourceSections(area, currentLesson, opts);
      toast(nextH ? 'تم إخفاء الفقرة عن الطلاب' : 'تم إظهار الفقرة للطلاب');
    } else if (act === 'toggle-unit') {
      var nextUH = !allHiddenUnitWide;
      matchInfo.resources.forEach(function (r) { r.hidden = nextUH; });
      save(); close();
      renderResourceSections(area, currentLesson, opts);
      toast((nextUH ? 'تم إخفاء الفقرة في ' : 'تم إظهار الفقرة في ') + matchInfo.lessonsCount + ' درس بالوحدة');
    } else if (act === 'delete-unit') {
      if (!confirm('حذف «' + gTitle + '» من جميع دروس الوحدة (' + matchInfo.lessonsCount + ' درس)؟')) return;
      var rmIds = {};
      var urlsCheck = [];
      matchInfo.resources.forEach(function (r) {
        rmIds[r.id] = true;
        if (r.url && urlsCheck.indexOf(r.url) === -1) urlsCheck.push(r.url);
      });
      data.resources = data.resources.filter(function (r) { return !rmIds[r.id]; });
      lessonsOf(data, currentLesson.unitId, true).forEach(function (l) {
        normalizeOrders(resourcesOf(data, l.id, 'exercise', true));
        normalizeOrders(resourcesOf(data, l.id, kind, true));
      });
      urlsCheck.forEach(releaseFileIfUnused);
      save(); close();
      renderResourceSections(area, currentLesson, opts);
      toast('تمت إزالة «' + gTitle + '» من ' + matchInfo.lessonsCount + ' درس في الوحدة', 'info');
    }
  });
}

function copySingleResourceToTargets(resource, targets) {
  var r = copyResourcesBundleToTargets([resource], targets);
  return { added: r.targetsUpdated, skipped: r.skipped };
}

function duplicateLesson(id, targetUnitId) {
  var l = getLesson(data, id);
  if (!l) return null;
  var isEx = isExerciseItem(l);
  var uId = targetUnitId || l.unitId;
  var nid = uid(isEx ? 'ex' : 'l');
  var siblings = isEx ? unitExercisesOf(data, uId) : lessonsOf(data, uId);
  var maxOrder = siblings.reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0);
  data.lessons.push({
    id: nid, unitId: uId,
    title: l.title + (uId === l.unitId ? ' (نسخة)' : ''),
    itemType: isEx ? 'exercise' : 'lesson',
    order: maxOrder + 1
  });
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
  allUnitItemsOf(data, id).forEach(function (l) {
    var isEx = isExerciseItem(l);
    var newLessonId = uid(isEx ? 'ex' : 'l');
    data.lessons.push({
      id: newLessonId, unitId: nid, title: l.title,
      itemType: isEx ? 'exercise' : 'lesson',
      order: l.order
    });
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
  if (currentTab !== 'schedule' && window._ayaActiveSchedTimer) {
    clearInterval(window._ayaActiveSchedTimer);
    window._ayaActiveSchedTimer = null;
  }
  if (currentTab === 'subjects') renderSubjectsPanel(p);
  else if (currentTab === 'schedule' && typeof renderAdminSchedulePanel === 'function') renderAdminSchedulePanel(p, data);
  else if (currentTab === 'ai' && typeof renderAiPanel === 'function') renderAiPanel(p);
  else if (currentTab === 'organizer') renderOrganizerPanel(p);
  else if (currentTab === 'units') renderUnitsPanel(p);
  else if (currentTab === 'lessons') renderLessonsPanel(p);
  else if (currentTab === 'exercises') renderExercisesPanel(p);
  else if (currentTab === 'content') renderContentPanel(p);
  else if (currentTab === 'backup') renderBackupPanel(p);
  var banner = cloudBannerHTML();
  if (banner) p.insertAdjacentHTML('afterbegin', banner);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- منظّم المحتوى: رؤية كاملة للمادة ← الوحدة ← الدرس / التمرين ---------- */
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
      data.lessons.push({ id: id, unitId: unitId, title: title, itemType: 'lesson', order: nextOrder });
      setItemOrder(lessonsOf(data, unitId), id, v.order);
      save(); renderPanel(); toast('تمت إضافة الدرس');
    }
  });
}

function openQuickExerciseDialog(unitId) {
  var unit = getUnit(data, unitId);
  if (!unit) return;
  var nextOrder = unitExercisesOf(data, unitId).length + 1;
  openEditDialog({
    title: 'إضافة تمرين إلى ' + unit.title, icon: 'pencil',
    fields: [
      { key: 'title', label: 'عنوان التمرين', placeholder: 'مثال: التمرين الأول / سلسلة تمارين رقم 1' },
      { key: 'order', label: 'موضعه في ترتيب التمارين', type: 'number', value: nextOrder }
    ],
    onSave: function (v) {
      var title = v.title.trim();
      if (!title) { toast('اكتب عنوان التمرين', 'err'); return; }
      var id = uid('ex');
      data.lessons.push({ id: id, unitId: unitId, title: title, itemType: 'exercise', order: nextOrder });
      setItemOrder(unitExercisesOf(data, unitId), id, v.order);
      save(); renderPanel(); toast('تمت إضافة التمرين');
    }
  });
}

function openCreatePathDialog() {
  openEditDialog({
    title: 'بناء مسار تعليمي جديد', icon: 'sparkles',
    fields: [
      { key: 'subject', label: 'اسم المادة', placeholder: 'مثال: الإعلام الآلي' },
      { key: 'coefficient', label: 'معامل المادة في البكالوريا (لتوزيع حصص استعمال الزمن)', type: 'number', value: 2 },
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
      var coeffVal = Math.max(1, Math.min(20, parseInt(v.coefficient, 10) || defaultSubjectCoefficient(subjectName)));
      data.subjects.push({
        id: subjectId, name: subjectName, icon: v.icon.trim() || 'book', color: v.color || 'indigo',
        coefficient: coeffVal,
        order: data.subjects.length + 1
      });
      data.units.push({ id: unitId, subjectId: subjectId, title: unitTitle, order: 1 });
      data.lessons.push({ id: lessonId, unitId: unitId, title: lessonTitle, itemType: 'lesson', order: 1 });
      save(); renderPanel(); toast('تم إنشاء المادة والوحدة والدرس');
    }
  });
}

function treeUnitHTML(unit, uIdx) {
  var lessons = lessonsOf(data, unit.id);
  var exercises = unitExercisesOf(data, unit.id);
  var allTitles = lessons.concat(exercises).map(function (l) { return l.title; }).join(' ');
  var unitSearch = (unit.title + ' ' + allTitles).toLocaleLowerCase();
  /* فتح الوحدة الأولى فقط والبقية مطوية بزر سهم للإظهار/الإخفاء */
  var openAttr = uIdx === 0 ? ' open' : '';
  return '<details class="tree-unit"' + openAttr + ' data-search="' + escapeHtml(unitSearch) + '">' +
    '<summary><span class="tree-label"><span class="tree-dot"></span>' + escapeHtml(unit.title) + hiddenPillHTML(unit.hidden) + '</span>' +
      '<span class="tree-meta">' + lessons.length + ' درس · ' + exercises.length + ' تمرين <span class="acc-chevron">' + svgIcon('chevron-down') + '</span></span></summary>' +
    '<div class="tree-node-body">' +
      '<div class="tree-actions">' +
        '<button type="button" class="tree-action" data-organizer-act="add-lesson" data-id="' + unit.id + '">' + svgIcon('plus') + ' إضافة درس</button>' +
        '<button type="button" class="tree-action" data-organizer-act="add-exercise" data-id="' + unit.id + '">' + svgIcon('pencil') + ' إضافة تمرين</button>' +
        '<button type="button" class="tree-action" data-organizer-act="manage-unit" data-id="' + unit.id + '">' + svgIcon('gear') + ' إدارة الوحدة</button>' +
        '<button type="button" class="tree-action" data-organizer-act="copy-unit" data-id="' + unit.id + '">' + svgIcon('copy') + ' نسخ</button>' +
      '</div>' +
      '<div class="tree-lessons">' +
        (lessons.length || exercises.length ? (
          lessons.map(function (l) {
            var resources = resourcesOf(data, l.id).length;
            return '<article class="tree-lesson" data-search="' + escapeHtml(l.title.toLocaleLowerCase()) + '">' +
              '<span class="tree-lesson-title">' + svgIcon('film') + ' ' + escapeHtml(l.title) + hiddenPillHTML(l.hidden) +
                '<span class="tree-meta">درس · ' + resources + ' محتوى</span></span>' +
              '<span class="tree-actions">' +
                '<button type="button" class="tree-action" data-organizer-act="manage-lesson" data-id="' + l.id + '">' + svgIcon('plus') + ' المحتوى</button>' +
                '<button type="button" class="tree-action" data-organizer-act="preview-lesson" data-id="' + l.id + '" title="معاينة الدرس" aria-label="معاينة الدرس">' + svgIcon('eye') + '</button>' +
              '</span>' +
            '</article>';
          }).join('') +
          exercises.map(function (ex) {
            var resources = resourcesOf(data, ex.id).length;
            return '<article class="tree-lesson tree-exercise" data-search="' + escapeHtml(ex.title.toLocaleLowerCase()) + '">' +
              '<span class="tree-lesson-title">' + svgIcon('pencil') + ' ' + escapeHtml(ex.title) + hiddenPillHTML(ex.hidden) +
                '<span class="tree-meta tree-meta-ex">تمرين · ' + resources + ' محتوى</span></span>' +
              '<span class="tree-actions">' +
                '<button type="button" class="tree-action" data-organizer-act="manage-exercise" data-id="' + ex.id + '">' + svgIcon('plus') + ' ملفات التمرين</button>' +
                '<button type="button" class="tree-action" data-organizer-act="preview-lesson" data-id="' + ex.id + '" title="معاينة التمرين" aria-label="معاينة التمرين">' + svgIcon('eye') + '</button>' +
              '</span>' +
            '</article>';
          }).join('')
        ) : '<div class="tree-empty">لا توجد دروس أو تمارين بعد — أضف من الأزرار أعلاه.</div>') +
      '</div>' +
    '</div>' +
  '</details>';
}

function treeSubjectHTML(subject, sIdx) {
  var units = unitsOf(data, subject.id);
  var coeff = getSubjectCoefficient(subject);
  var lessonsCount = units.reduce(function (sum, u) { return sum + lessonsOf(data, u.id).length; }, 0);
  var exercisesCount = units.reduce(function (sum, u) { return sum + unitExercisesOf(data, u.id).length; }, 0);
  var search = (subject.name + ' ' + units.map(function (u) {
    return u.title + ' ' + allUnitItemsOf(data, u.id).map(function (l) { return l.title; }).join(' ');
  }).join(' ')).toLocaleLowerCase();
  /* فتح المادة الأولى فقط والبقية مقفولة بزر سهم للإظهار/الإخفاء */
  var openAttr = sIdx === 0 ? ' open' : '';
  return '<details class="tree-subject"' + openAttr + ' data-search="' + escapeHtml(search) + '">' +
    '<summary><span class="tree-label tree-subject-label">' + iconHTML(subject.icon, 'book') + ' ' + escapeHtml(subject.name) +
      ' <span class="coeff-pill">المعامل ' + coeff + '</span>' + hiddenPillHTML(subject.hidden) + '</span>' +
      '<span class="tree-meta">' + units.length + ' وحدة · ' + lessonsCount + ' درس · ' + exercisesCount + ' تمرين <span class="acc-chevron">' + svgIcon('chevron-down') + '</span></span></summary>' +
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
  var totalLessons = data.lessons.filter(function (l) { return !isExerciseItem(l); }).length;
  var totalExercises = data.lessons.filter(function (l) { return isExerciseItem(l); }).length;

  p.innerHTML =
    '<h2>' + svgIcon('layers') + ' منظّم المحتوى</h2>' +
    '<p class="hint">عرض المادة ← الوحدة ← الدروس والتمارين في مكان واحد. استخدمه للإضافة السريعة، البحث، النسخ أو الوصول المباشر إلى محتوى أي درس أو تمرين.</p>' +
    '<div class="organizer-head">' +
      '<div class="organizer-stats">' +
        '<span>' + svgIcon('book') + ' ' + data.subjects.length + ' مادة</span>' +
        '<span>' + svgIcon('layers') + ' ' + data.units.length + ' وحدة</span>' +
        '<span>' + svgIcon('film') + ' ' + totalLessons + ' درس</span>' +
        '<span>' + svgIcon('pencil') + ' ' + totalExercises + ' تمرين</span>' +
      '</div>' +
      '<button type="button" class="btn btn-primary" id="buildPathBtn">' + svgIcon('sparkles') + ' بناء مادة ووحدة ودرس</button>' +
    '</div>' +
    '<div class="organizer-search"><span>' + svgIcon('search') + '</span><input id="organizerSearch" type="search" placeholder="ابحث باسم مادة أو وحدة أو درس أو تمرين…" autocomplete="off"></div>' +
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
    else if (action === 'add-exercise') openQuickExerciseDialog(id);
    else if (action === 'manage-subject') { sel.subject = id; goToAdminTab('subjects'); }
    else if (action === 'manage-unit') {
      var unit = getUnit(data, id);
      if (unit) { sel.subject = unit.subjectId; sel.unit = id; sel.lesson = ''; goToAdminTab('units'); }
    } else if (action === 'manage-lesson') {
      var path = lessonPath(data, id);
      if (path && path.subject && path.unit) {
        sel.subject = path.subject.id; sel.unit = path.unit.id; sel.lesson = id; goToAdminTab('content');
      }
    } else if (action === 'manage-exercise') {
      var exPath = lessonPath(data, id);
      if (exPath && exPath.subject && exPath.unit) {
        sel.subject = exPath.subject.id; sel.unit = exPath.unit.id; sel.exercise = id; goToAdminTab('exercises');
      }
    } else if (action === 'preview-lesson') {
      window.open('lesson.html?lesson=' + encodeURIComponent(id), '_blank');
    } else if (action === 'copy-unit') {
      var unitToCopy = getUnit(data, id);
      if (unitToCopy && confirm('نسخ وحدة "' + unitToCopy.title + '" مع كل دروسها وتمارينها ومحتواها؟')) {
        duplicateUnit(id); renderPanel(); toast('تم إنشاء نسخة كاملة من الوحدة');
      }
    } else if (action === 'copy-subject') {
      var subjectToCopy = getSubject(data, id);
      if (subjectToCopy && confirm('نسخ مادة "' + subjectToCopy.name + '" بكامل وحداتها ودروسها وتمارينها؟')) {
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
    '<div class="sec-head-row" style="margin-bottom:6px">' +
      '<h2 style="margin:0">' + svgIcon('book') + ' إدارة المواد ومعاملاتها</h2>' +
      '<button type="button" class="btn btn-sm btn-primary" id="gotoAdminSchedBtn">' + svgIcon('calendar') + ' إضافة وإدارة استعمال الزمن</button>' +
    '</div>' +
    '<p class="hint">أضف مادة وحدّد <b>معاملها في البكالوريا</b> (يعتمد عليه الموقع تلقائياً لتكرار حصص المادة وتوزيع الدروس في استعمال الزمن الأسبوعي). يمكنك أيضاً إخفاء أي مادة مؤقتاً عن الطلاب.</p>' +
    '<div class="frm-card">' +
      '<div class="frm-row">' +
        '<input class="inp" id="nsName" placeholder="اسم المادة (مثال: الرياضيات)">' +
        '<div class="coeff-inp-wrap" title="معامل المادة في البكالوريا">' +
          '<label for="nsCoeff">المعامل</label>' +
          '<input class="inp coeff-inp" id="nsCoeff" type="number" min="1" max="20" value="2">' +
        '</div>' +
        '<input class="inp" id="nsIcon" dir="ltr" placeholder="رابط صورة أو اسم أيقونة SVG (مثال: math)" style="flex:2 1 200px">' +
        '<div class="icon-preview" id="nsIconPreview">' + svgIcon('book') + '</div>' +
        '<select class="inp" id="nsColor">' + SUBJECT_COLORS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>' +
        '<button class="btn btn-primary" id="nsAdd">' + svgIcon('plus') + ' إضافة مادة</button>' +
      '</div>' +
    '</div>' +
    '<div class="admin-list" id="subjList">' +
      (list.length ? list.map(function (s) {
        var units = unitsOf(data, s.id);
        var lCount = units.reduce(function (n, u) { return n + lessonsOf(data, u.id).length; }, 0);
        var exCount = units.reduce(function (n, u) { return n + unitExercisesOf(data, u.id).length; }, 0);
        var coeff = getSubjectCoefficient(s);
        return '<div class="item-row c-' + (s.color || 'indigo') + (s.hidden ? ' is-hidden-row' : '') + '">' +
          '<div class="item-ico">' + iconHTML(s.icon, 'book') + '</div>' +
          '<div class="item-info">' +
            '<div class="item-title">' + escapeHtml(s.name) +
              ' <span class="coeff-pill">المعامل ' + coeff + '</span>' +
              hiddenPillHTML(s.hidden) +
            '</div>' +
            '<div class="item-sub">' + units.length + ' وحدة · ' + lCount + ' درس · ' + exCount + ' تمرين</div>' +
          '</div>' +
          actsHTML(s.id,
            '<div class="coeff-stepper" title="تعديل سريع لمعامل المادة">' +
              '<button type="button" class="mini-ic-btn" data-act="coeff-dec" data-id="' + s.id + '" title="إنقاص المعامل">−</button>' +
              '<span class="coeff-stepper-val">' + coeff + '</span>' +
              '<button type="button" class="mini-ic-btn" data-act="coeff-inc" data-id="' + s.id + '" title="زيادة المعامل">+</button>' +
            '</div>' +
            hideBtnHTML(s.id, s.hidden, 'إخفاء المادة عن الطلاب', 'إظهار المادة للطلاب') +
            '<button class="icon-btn" data-act="copy" data-id="' + s.id + '" title="نسخ المادة بكل محتواها">' + svgIcon('copy') + '</button>'
          ) +
        '</div>';
      }).join('') : '<div class="empty">لا توجد مواد — أضف أول مادة أعلاه</div>') +
    '</div>';

  var gotoSched = $('#gotoAdminSchedBtn', p);
  if (gotoSched) {
    gotoSched.addEventListener('click', function () { goToAdminTab('schedule'); });
  }

  /* اقتراح المعامل تلقائياً أثناء كتابة اسم المادة */
  var coeffTouched = false;
  $('#nsCoeff').addEventListener('input', function () { coeffTouched = true; });
  $('#nsName').addEventListener('input', function () {
    if (!coeffTouched && this.value.trim()) {
      $('#nsCoeff').value = defaultSubjectCoefficient(this.value);
    }
  });

  /* معاينة مباشرة للأيقونة أثناء الكتابة */
  $('#nsIcon').addEventListener('input', function () {
    $('#nsIconPreview').innerHTML = iconHTML(this.value, 'book');
  });

  $('#nsAdd').addEventListener('click', function () {
    var name = $('#nsName').value.trim();
    if (!name) { toast('اكتب اسم المادة', 'err'); return; }
    var coeffVal = Math.max(1, Math.min(20, parseInt($('#nsCoeff').value, 10) || defaultSubjectCoefficient(name)));
    data.subjects.push({
      id: uid('s'), name: name,
      icon: $('#nsIcon').value.trim() || 'book', color: $('#nsColor').value,
      coefficient: coeffVal,
      order: (data.subjects.reduce(function (m, s) { return Math.max(m, s.order || 0); }, 0) + 1)
    });
    save(); renderPanel(); toast('تمت إضافة المادة (المعامل: ' + coeffVal + ')');
  });

  bindList($('#subjList'), {
    up: function (id) { moveItem(data.subjects, id, -1); renderPanel(); },
    down: function (id) { moveItem(data.subjects, id, 1); renderPanel(); },
    coeffInc: function (id) {
      var s = getSubject(data, id);
      if (!s) return;
      s.coefficient = Math.min(20, getSubjectCoefficient(s) + 1);
      save(); renderPanel(); toast('معامل «' + s.name + '» أصبح ' + s.coefficient);
    },
    coeffDec: function (id) {
      var s = getSubject(data, id);
      if (!s) return;
      s.coefficient = Math.max(1, getSubjectCoefficient(s) - 1);
      save(); renderPanel(); toast('معامل «' + s.name + '» أصبح ' + s.coefficient);
    },
    toggleHide: function (id) {
      var s = getSubject(data, id);
      if (!s) return;
      s.hidden = !s.hidden;
      save(); renderPanel();
      toast(s.hidden ? 'تم إخفاء المادة عن الطلاب' : 'تم إظهار المادة للطلاب');
    },
    rename: function (id) {
      var s = getSubject(data, id);
      openEditDialog({
        title: 'تعديل المادة ومعاملها', icon: 'book',
        fields: [
          { key: 'name', label: 'اسم المادة', value: s.name, placeholder: 'مثال: الرياضيات' },
          { key: 'coefficient', label: 'معامل المادة في البكالوريا (لتوزيع حصص استعمال الزمن)', type: 'number', value: getSubjectCoefficient(s) },
          { key: 'icon', label: 'الأيقونة — اسم SVG أو رابط صورة', type: 'icon', value: s.icon || '', placeholder: 'مثال: math أو https://...' },
          { key: 'color', label: 'اللون', type: 'select', value: s.color, options: colorOptions() },
          { key: 'order', label: 'موضع المادة في الترتيب', type: 'number', value: s.order || 1 }
        ],
        onSave: function (v) {
          s.name = v.name.trim() || s.name;
          s.coefficient = Math.max(1, Math.min(20, parseInt(v.coefficient, 10) || getSubjectCoefficient(s)));
          s.icon = v.icon.trim() || 'book';
          s.color = v.color || 'indigo';
          setItemOrder(data.subjects, s.id, v.order);
          save(); renderPanel(); toast('تم حفظ تعديلات المادة ومعاملها');
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

  /* الوحدة الأولى فقط مفتوحة افتراضياً والبقية مقفولة بزر سهم لإظهار/إخفاء المحتوى */
  if (sel.subject && list.length && !adminOpenUnits[sel.subject]) {
    adminOpenUnits[sel.subject] = {};
    adminOpenUnits[sel.subject][list[0].id] = true;
  }

  p.innerHTML =
    '<h2>' + svgIcon('layers') + ' إدارة الوحدات</h2>' +
    '<p class="hint">اختر المادة ثم أضف وحداتها التعليمية. الوحدة الأولى مفتوحة افتراضياً والبقية مطوية — اضغط زر السهم لعرض دروس وتمارين أي وحدة أو إدارتها.</p>' +
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
        var exs = unitExercisesOf(data, u.id);
        var isOpen = !!(adminOpenUnits[sel.subject] && adminOpenUnits[sel.subject][u.id]);
        return '<div class="unit-acc-card' + (isOpen ? ' is-open' : '') + (u.hidden ? ' is-hidden-row' : '') + '">' +
          '<div class="item-row unit-acc-head" data-unit-head="' + u.id + '">' +
            '<div class="item-ico">' + (i + 1) + '</div>' +
            '<div class="item-info"><div class="item-title">' + escapeHtml(u.title) + hiddenPillHTML(u.hidden) + '</div>' +
            '<div class="item-sub">' + ls.length + ' درس · ' + exs.length + ' تمرين</div></div>' +
            actsHTML(u.id,
              '<button type="button" class="btn-acc-arrow' + (isOpen ? ' open' : '') + '" data-act="toggle-open" data-id="' + u.id + '" title="' + (isOpen ? 'طي محتوى الوحدة' : 'إظهار دروس وتمارين الوحدة') + '">' +
                '<span>' + (isOpen ? 'إخفاء' : 'إظهار') + '</span>' + svgIcon('chevron-down') +
              '</button>' +
              hideBtnHTML(u.id, u.hidden, 'إخفاء الوحدة عن الطلاب', 'إظهار الوحدة للطلاب') +
              '<button class="icon-btn" data-act="copy" data-id="' + u.id + '" title="إنشاء نسخة (مع دروسها وتمارينها)">' + svgIcon('copy') + '</button>'
            ) +
          '</div>' +
          (isOpen
            ? '<div class="unit-acc-body">' +
                '<div class="unit-acc-quick">' +
                  '<button type="button" class="btn btn-sm" data-uquick="lessons" data-id="' + u.id + '">' + svgIcon('film') + ' إدارة الدروس (' + ls.length + ')</button>' +
                  '<button type="button" class="btn btn-sm" data-uquick="exercises" data-id="' + u.id + '">' + svgIcon('pencil') + ' إدارة التمارين (' + exs.length + ')</button>' +
                  '<a class="btn btn-sm" href="unit.html?unit=' + encodeURIComponent(u.id) + '" target="_blank">' + svgIcon('eye') + ' معاينة الوحدة</a>' +
                '</div>' +
                (ls.length || exs.length
                  ? '<div class="unit-acc-chips">' +
                      ls.map(function (l, li) {
                        return '<button type="button" class="unit-mini-chip" data-uquick="open-lesson" data-id="' + l.id + '">' +
                          svgIcon('film') + ' <span>' + (li + 1) + '. ' + escapeHtml(l.title) + '</span>' + (l.hidden ? ' <em>(مخفي)</em>' : '') +
                        '</button>';
                      }).join('') +
                      exs.map(function (ex) {
                        return '<button type="button" class="unit-mini-chip is-ex" data-uquick="open-ex" data-id="' + ex.id + '">' +
                          svgIcon('pencil') + ' <span>' + escapeHtml(ex.title) + '</span>' + (ex.hidden ? ' <em>(مخفي)</em>' : '') +
                        '</button>';
                      }).join('') +
                    '</div>'
                  : '<div class="item-sub" style="padding:4px 2px">لا توجد دروس أو تمارين مضافة في هذه الوحدة بعد.</div>') +
              '</div>'
            : '') +
        '</div>';
      }).join('') : '<div class="empty">لا توجد وحدات في هذه المادة — أضف وحدة أعلاه</div>') +
    '</div>';

  $('#uSubject').addEventListener('change', function () { sel.subject = this.value; sel.unit = ''; sel.lesson = ''; renderPanel(); });

  $('#uAdd').addEventListener('click', function () {
    if (!sel.subject) { toast('اختر المادة أولاً', 'err'); return; }
    var t = $('#uTitle').value.trim();
    if (!t) { toast('اكتب عنوان الوحدة', 'err'); return; }
    var newUId = uid('u');
    data.units.push({
      id: newUId, subjectId: sel.subject, title: t,
      order: (unitsOf(data, sel.subject).reduce(function (m, u) { return Math.max(m, u.order || 0); }, 0) + 1)
    });
    if (!adminOpenUnits[sel.subject]) adminOpenUnits[sel.subject] = {};
    adminOpenUnits[sel.subject][newUId] = true;
    save(); renderPanel(); toast('تمت إضافة الوحدة');
  });

  $('#unitList').addEventListener('click', function (e) {
    var qBtn = e.target.closest('[data-uquick]');
    if (qBtn) {
      var qAct = qBtn.dataset.uquick, qId = qBtn.dataset.id;
      if (qAct === 'lessons') { sel.unit = qId; goToAdminTab('lessons'); }
      else if (qAct === 'exercises') { sel.unit = qId; goToAdminTab('exercises'); }
      else if (qAct === 'open-lesson') { sel.lesson = qId; var lp = lessonPath(data, qId); if (lp && lp.unit) sel.unit = lp.unit.id; goToAdminTab('content'); }
      else if (qAct === 'open-ex') { sel.exercise = qId; var ep = lessonPath(data, qId); if (ep && ep.unit) sel.unit = ep.unit.id; goToAdminTab('exercises'); }
      return;
    }
    if (e.target.closest('[data-act]')) return;
    var head = e.target.closest('[data-unit-head]');
    if (head) {
      var uidClick = head.dataset.unitHead;
      if (!adminOpenUnits[sel.subject]) adminOpenUnits[sel.subject] = {};
      adminOpenUnits[sel.subject][uidClick] = !adminOpenUnits[sel.subject][uidClick];
      renderPanel();
    }
  });

  bindList($('#unitList'), {
    toggleOpen: function (id) {
      if (!adminOpenUnits[sel.subject]) adminOpenUnits[sel.subject] = {};
      adminOpenUnits[sel.subject][id] = !adminOpenUnits[sel.subject][id];
      renderPanel();
    },
    toggleHide: function (id) {
      var u = getUnit(data, id);
      if (!u) return;
      u.hidden = !u.hidden;
      save(); renderPanel();
      toast(u.hidden ? 'تم إخفاء الوحدة عن الطلاب' : 'تم إظهار الوحدة للطلاب');
    },
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

  /* في لوحة الأدمن: الدرس الأول مفتوح افتراضياً والبقية قابلة للطي بزر السهم */
  if (sel.unit && list.length && !adminOpenLessons[sel.unit]) {
    adminOpenLessons[sel.unit] = {};
    adminOpenLessons[sel.unit][list[0].id] = true;
  }

  p.innerHTML =
    '<h2>' + svgIcon('film') + ' إدارة الدروس</h2>' +
    '<p class="hint">اختر المادة ثم الوحدة وأضف الدروس المرتبة (الدرس الأول مفتوح افتراضياً والبقية تطوى وتفتح بزر السهم).</p>' +
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
        var vids = resourcesOf(data, l.id, 'video').length;
        var pdfs = resourcesOf(data, l.id, 'pdf').length;
        var imgs = resourcesOf(data, l.id, 'image').length;
        var exs  = resourcesOf(data, l.id, 'exercise').length;
        var isOpen = !!(adminOpenLessons[sel.unit] && adminOpenLessons[sel.unit][l.id]);

        return '<div class="unit-acc-card' + (isOpen ? ' is-open' : '') + (l.hidden ? ' is-hidden-row' : '') + '">' +
          '<div class="item-row unit-acc-head" data-lesson-head="' + l.id + '">' +
            '<div class="item-ico">' + (i + 1) + '</div>' +
            '<div class="item-info"><div class="item-title">' + escapeHtml(l.title) + hiddenPillHTML(l.hidden) + '</div>' +
            '<div class="item-sub">' + res.length + ' عنصر محتوى</div></div>' +
            actsHTML(l.id,
              '<button type="button" class="btn-acc-arrow' + (isOpen ? ' open' : '') + '" data-act="toggle-open" data-id="' + l.id + '" title="' + (isOpen ? 'طي تفاصيل الدرس' : 'إظهار أقسام الدرس') + '">' +
                '<span>' + (isOpen ? 'إخفاء' : 'إظهار') + '</span>' + svgIcon('chevron-down') +
              '</button>' +
              hideBtnHTML(l.id, l.hidden, 'إخفاء الدرس عن الطلاب', 'إظهار الدرس للطلاب') +
              '<button class="icon-btn" data-act="copy" data-id="' + l.id + '" title="إنشاء نسخة">' + svgIcon('copy') + '</button>' +
              '<button class="icon-btn" data-act="goto" data-id="' + l.id + '" title="إدارة المحتوى">' + svgIcon('plus') + '</button>' +
              '<button class="icon-btn" data-act="view" data-id="' + l.id + '" title="معاينة الدرس">' + svgIcon('eye') + '</button>'
            ) +
          '</div>' +
          (isOpen
            ? '<div class="unit-acc-body">' +
                '<div class="unit-acc-chips" style="margin-bottom:8px">' +
                  '<span class="unit-mini-chip">' + svgIcon('film') + ' فيديوهات: ' + vids + '</span>' +
                  '<span class="unit-mini-chip">' + svgIcon('file') + ' ملفات PDF: ' + pdfs + '</span>' +
                  '<span class="unit-mini-chip">' + svgIcon('image') + ' صور: ' + imgs + '</span>' +
                  '<span class="unit-mini-chip is-ex">' + svgIcon('pencil') + ' تمارين مرفقة: ' + exs + '</span>' +
                '</div>' +
                '<div class="unit-acc-quick">' +
                  '<button type="button" class="btn btn-primary btn-sm" data-lquick="edit-content" data-id="' + l.id + '">' + svgIcon('plus') + ' إضافة وتعديل أقسام الدرس</button>' +
                  '<a class="btn btn-sm" href="lesson.html?lesson=' + encodeURIComponent(l.id) + '" target="_blank">' + svgIcon('eye') + ' معاينة الدرس</a>' +
                '</div>' +
              '</div>'
            : '') +
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
    var newLId = uid('l');
    data.lessons.push({
      id: newLId, unitId: sel.unit, title: t, itemType: 'lesson',
      order: (lessonsOf(data, sel.unit).reduce(function (m, l) { return Math.max(m, l.order || 0); }, 0) + 1)
    });
    if (!adminOpenLessons[sel.unit]) adminOpenLessons[sel.unit] = {};
    adminOpenLessons[sel.unit][newLId] = true;
    save(); renderPanel(); toast('تمت إضافة الدرس');
  });

  $('#lessonList').addEventListener('click', function (e) {
    var lq = e.target.closest('[data-lquick="edit-content"]');
    if (lq) {
      sel.lesson = lq.dataset.id;
      goToAdminTab('content');
      return;
    }
    if (e.target.closest('[data-act]')) return;
    var head = e.target.closest('[data-lesson-head]');
    if (head) {
      var lid = head.dataset.lessonHead;
      if (!adminOpenLessons[sel.unit]) adminOpenLessons[sel.unit] = {};
      adminOpenLessons[sel.unit][lid] = !adminOpenLessons[sel.unit][lid];
      renderPanel();
    }
  });

  bindList($('#lessonList'), {
    toggleOpen: function (id) {
      if (!adminOpenLessons[sel.unit]) adminOpenLessons[sel.unit] = {};
      adminOpenLessons[sel.unit][id] = !adminOpenLessons[sel.unit][id];
      renderPanel();
    },
    toggleHide: function (id) {
      var l = getLesson(data, id);
      if (!l) return;
      l.hidden = !l.hidden;
      save(); renderPanel();
      toast(l.hidden ? 'تم إخفاء الدرس عن الطلاب' : 'تم إظهار الدرس للطلاب');
    },
    up: function (id) { moveItem(data.lessons.filter(function (l) { return l.unitId === sel.unit && !isExerciseItem(l); }), id, -1); renderPanel(); },
    down: function (id) { moveItem(data.lessons.filter(function (l) { return l.unitId === sel.unit && !isExerciseItem(l); }), id, 1); renderPanel(); },
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
            normalizeOrders(data.lessons.filter(function (x) { return x.unitId === oldUnitId && !isExerciseItem(x); }));
            sel.subject = targetUnit.subjectId; sel.unit = targetUnit.id; sel.lesson = l.id;
          }
          setItemOrder(data.lessons.filter(function (x) { return x.unitId === l.unitId && !isExerciseItem(x); }), l.id, v.order);
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

/* ---------- تبويب التمارين المستقل (إضافة التمارين: فيديو / صور / PDF) ---------- */
function renderExercisesPanel(p) {
  if (!sel.subject) { var s0 = data.subjects.slice().sort(byOrder)[0]; if (s0) sel.subject = s0.id; }
  if (!sel.subject || !getUnit(data, sel.unit)) { sel.unit = (unitsOf(data, sel.subject)[0] || {}).id || ''; }

  var exList = sel.unit ? unitExercisesOf(data, sel.unit) : [];
  var unitRegularLessons = sel.unit ? lessonsOf(data, sel.unit) : [];
  if (!sel.exercise || !getLesson(data, sel.exercise) || !isExerciseItem(getLesson(data, sel.exercise)) || getLesson(data, sel.exercise).unitId !== sel.unit) {
    sel.exercise = (exList[0] || {}).id || '';
  }
  var activeExercise = sel.exercise ? getLesson(data, sel.exercise) : null;

  p.innerHTML =
    '<h2>' + svgIcon('pencil') + ' قسم التمارين (صفحة التمارين ثم النسخ إلى الدروس)</h2>' +
    '<p class="hint">أضف عناوين التمارين وحلولها المصوّرة أو ملفات الـ PDF والفيديو هنا بشكل ديناميكي (عنوان + صورة أو عدة صور، ثم عنوان جديد تحته...)، ثم اضغط <b>«نسخ / مزامنة إلى دروس الوحدة»</b> لتظهر تلقائياً في قسم التمارين داخل جميع دروس الوحدة.</p>' +

    /* 1) اختيار المادة والوحدة + إنشاء تمرين جديد */
    '<div class="frm-card">' +
      '<div class="frm-row">' +
        '<select class="inp" id="exSubjSel">' + subjectOptions(sel.subject) + '</select>' +
        '<select class="inp" id="exUnitSel">' + unitOptions(sel.subject, sel.unit) + '</select>' +
        (sel.unit
          ? '<a class="btn" href="unit.html?unit=' + encodeURIComponent(sel.unit) + '&section=exercises" target="_blank">' + svgIcon('eye') + ' معاينة صفحة التمارين</a>'
          : '') +
      '</div>' +
      '<div class="frm-row" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">' +
        '<input class="inp" id="exNewTitle" placeholder="عنوان التمرين الجديد (مثال: تمرين 1-2-3 / سلسلة تمارين 1 / بكالوريا 2025)">' +
        '<button class="btn btn-primary" id="exAddBtn">' + svgIcon('plus') + ' إضافة تمرين جديد</button>' +
      '</div>' +
    '</div>' +

    /* 2) قائمة التمارين في هذه الوحدة + زر مزامنة الكل للدروس */
    '<div class="sec-head-row" style="margin:18px 0 10px">' +
      '<h3 class="sub-title" style="margin:0">' + svgIcon('pencil') + ' قائمة تمارين الوحدة <span class="cnt">' + exList.length + '</span></h3>' +
      (exList.length && unitRegularLessons.length
        ? '<button type="button" class="btn btn-primary btn-sm" id="syncAllUnitExBtn">' +
            svgIcon('copy') + ' نسخ ومزامنة كل التمارين إلى دروس الوحدة (' + unitRegularLessons.length + ' درس)' +
          '</button>'
        : '') +
    '</div>' +
    '<div class="admin-list" id="unitExList">' +
      (exList.length ? exList.map(function (ex, i) {
        var vids = resourcesOf(data, ex.id, 'video');
        var pdfs = resourcesOf(data, ex.id, 'pdf');
        var imgs = resourcesOf(data, ex.id, 'image');
        var totalGroups = groupResources(imgs).length + groupResources(pdfs).length + groupResources(vids).length;
        var syncedMatch = findMatchingResourcesAcrossUnitLessons(ex.unitId, imgs.concat(pdfs).concat(vids), ex.title);
        var hiddenInLessons = syncedMatch.resources.length > 0 && syncedMatch.resources.every(function (r) { return !!r.hidden; });
        var isSel = activeExercise && activeExercise.id === ex.id;
        return '<div class="item-row ex-admin-row' + (isSel ? ' active-ex-row' : '') + (ex.hidden ? ' is-hidden-row' : '') + '" data-select-ex="' + ex.id + '">' +
          '<div class="item-ico">' + (i + 1) + '</div>' +
          '<div class="item-info">' +
            '<div class="item-title">' + escapeHtml(ex.title) +
              (isSel ? ' <span class="ex-active-pill">التمرين المفتوح حالياً</span>' : '') +
              hiddenPillHTML(ex.hidden) +
              (hiddenInLessons ? ' <span class="hidden-pill">' + svgIcon('eye-off') + ' مخفي في الدروس</span>' : '') +
            '</div>' +
            '<div class="item-sub" dir="rtl" style="text-align:right">' +
              totalGroups + ' عنوان ديناميكي · ' + imgs.length + ' صورة · ' + pdfs.length + ' PDF · ' + vids.length + ' فيديو' +
              (syncedMatch.lessonsCount ? ' · منسوخ في ' + syncedMatch.lessonsCount + ' درس' : '') +
            '</div>' +
          '</div>' +
          actsHTML(ex.id,
            '<button class="btn-mini-copy' + (isSel ? ' on' : '') + '" data-act="select" data-id="' + ex.id + '" title="فتح هذا التمرين لإضافة العناوين والصور والملفات">' +
              svgIcon('plus') + '<span>' + (isSel ? 'مفتوح بالأسفل' : 'إدارة الفقرات') + '</span>' +
            '</button>' +
            (unitRegularLessons.length
              ? '<button class="btn-mini-copy" data-act="copy-to-lessons" data-id="' + ex.id + '" title="نسخ هذا التمرين بجميع عناوينه وصوره إلى كل دروس الوحدة">' +
                  svgIcon('copy') + '<span>نسخ للدروس</span>' +
                '</button>'
              : '') +
            '<button class="btn-mini-warn" data-act="unit-manage" data-id="' + ex.id + '" title="إخفاء أو إزالة التمرين من كل دروس الوحدة أو حذفه">' +
              svgIcon('sliders') + '<span>إخفاء / إزالة</span>' +
            '</button>' +
            hideBtnHTML(ex.id, ex.hidden, 'إخفاء التمرين من صفحة التمارين', 'إظهار التمرين في صفحة التمارين') +
            '<button class="icon-btn" data-act="view" data-id="' + ex.id + '" title="معاينة صفحة التمرين">' + svgIcon('eye') + '</button>' +
            '<button class="icon-btn" data-act="copy" data-id="' + ex.id + '" title="إنشاء نسخة من التمرين">' + svgIcon('copy') + '</button>'
          ) +
        '</div>';
      }).join('') : '<div class="empty">لا توجد تمارين في هذه الوحدة بعد — اكتب عنوان التمرين أعلاه واضغط «إضافة تمرين جديد»</div>') +
    '</div>' +

    /* 3) مساحة رفع وإضافة العناوين الديناميكية والصور والـ PDF والفيديو للتمرين المحدد */
    '<div id="exResWrap"></div>';

  $('#exSubjSel').addEventListener('change', function () {
    sel.subject = this.value;
    sel.unit = (unitsOf(data, sel.subject)[0] || {}).id || '';
    sel.exercise = (unitExercisesOf(data, sel.unit)[0] || {}).id || '';
    renderPanel();
  });
  $('#exUnitSel').addEventListener('change', function () {
    sel.unit = this.value;
    sel.exercise = (unitExercisesOf(data, sel.unit)[0] || {}).id || '';
    renderPanel();
  });

  var syncAllBtn = $('#syncAllUnitExBtn');
  if (syncAllBtn) {
    syncAllBtn.addEventListener('click', function () {
      var uObj = getUnit(data, sel.unit);
      var uTitle = uObj ? uObj.title : 'هذه الوحدة';
      if (!confirm('نسخ ومزامنة جميع تمارين وحدة «' + uTitle + '» بعناوينها وصورها وملفاتها بالترتيب إلى قسم «تمارين وتطبيقات» في جميع الدروس (' + unitRegularLessons.length + ' درس)؟')) {
        return;
      }
      var out = syncStandaloneExercisesToUnitLessons(sel.unit, null);
      if (out.lessonsCount > 0) {
        toast('تم نسخ ومزامنة التمارين (' + out.itemsCount + ' عنصر) إلى ' + out.lessonsCount + ' درس بنجاح');
      }
    });
  }

  function createUnitExercise() {
    if (!sel.unit) { toast('اختر الوحدة أولاً', 'err'); return; }
    var t = $('#exNewTitle').value.trim();
    if (!t) { toast('اكتب عنوان التمرين', 'err'); return; }
    var newId = uid('ex');
    var nextOrd = unitExercisesOf(data, sel.unit).reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0) + 1;
    data.lessons.push({
      id: newId, unitId: sel.unit, title: t, itemType: 'exercise', order: nextOrd
    });
    sel.exercise = newId;
    save();
    renderPanel();
    toast('تم إنشاء التمرين — يمكنك الآن إضافة العناوين والصور والملفات له بالأسفل');
  }

  $('#exAddBtn').addEventListener('click', createUnitExercise);
  $('#exNewTitle').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); createUnitExercise(); }
  });

  /* النقر على السطر يختار التمرين مباشرة لسهولة الإضافة */
  $('#unitExList').addEventListener('click', function (e) {
    if (e.target.closest('[data-act]')) return;
    var row = e.target.closest('[data-select-ex]');
    if (row && row.dataset.selectEx !== sel.exercise) {
      sel.exercise = row.dataset.selectEx;
      renderPanel();
    }
  });

  bindList($('#unitExList'), {
    select: function (id) {
      sel.exercise = id;
      renderPanel();
      var w = $('#exResWrap');
      if (w) setTimeout(function () { w.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    },
    copyToLessons: function (id) {
      var exItem = getLesson(data, id);
      if (!exItem) return;
      if (!confirm('نسخ تمرين «' + exItem.title + '» بجميع عناوينه وصوره وملفاته إلى قسم «تمارين وتطبيقات» في كل دروس هذه الوحدة (' + unitRegularLessons.length + ' درس)؟')) {
        return;
      }
      var res = syncStandaloneExercisesToUnitLessons(sel.unit, id);
      if (res.lessonsCount > 0) {
        toast('تم نسخ «' + exItem.title + '» إلى ' + res.lessonsCount + ' درس داخل الوحدة');
      }
    },
    up: function (id) {
      moveItem(data.lessons.filter(function (x) { return x.unitId === sel.unit && isExerciseItem(x); }), id, -1);
      renderPanel();
    },
    down: function (id) {
      moveItem(data.lessons.filter(function (x) { return x.unitId === sel.unit && isExerciseItem(x); }), id, 1);
      renderPanel();
    },
    rename: function (id) {
      var ex = getLesson(data, id);
      var unitOpts = [];
      data.subjects.slice().sort(byOrder).forEach(function (s) {
        unitsOf(data, s.id).forEach(function (u) {
          unitOpts.push({ value: u.id, label: s.name + ' — ' + u.title });
        });
      });
      openEditDialog({
        title: 'تعديل التمرين', icon: 'pencil',
        fields: [
          { key: 'title', label: 'عنوان التمرين', value: ex.title },
          { key: 'unit', label: 'الوحدة (لنقل التمرين إليها)', type: 'select', value: ex.unitId, options: unitOpts },
          { key: 'order', label: 'موضع التمرين في الترتيب', type: 'number', value: ex.order || 1 }
        ],
        onSave: function (v) {
          ex.title = v.title.trim() || ex.title;
          var targetUnit = getUnit(data, v.unit);
          var oldUnitId = ex.unitId;
          if (targetUnit && targetUnit.id !== ex.unitId) {
            ex.unitId = targetUnit.id;
            normalizeOrders(data.lessons.filter(function (x) { return x.unitId === oldUnitId && isExerciseItem(x); }));
            sel.subject = targetUnit.subjectId; sel.unit = targetUnit.id; sel.exercise = ex.id;
          }
          setItemOrder(data.lessons.filter(function (x) { return x.unitId === ex.unitId && isExerciseItem(x); }), ex.id, v.order);
          save(); renderPanel(); toast('تم حفظ تعديلات التمرين');
        }
      });
    },
    copy: function (id) {
      var newExId = duplicateLesson(id);
      if (newExId) sel.exercise = newExId;
      renderPanel(); toast('تم إنشاء نسخة من التمرين مع جميع ملفاته', 'info');
    },
    unitManage: function (id) {
      openUnitExerciseManageDialog(id);
    },
    toggleHide: function (id) {
      var ex = getLesson(data, id);
      if (!ex) return;
      ex.hidden = !ex.hidden;
      save(); renderPanel();
      toast(ex.hidden ? 'تم إخفاء التمرين من صفحة التمارين' : 'تم إظهار التمرين في صفحة التمارين');
    },
    view: function (id) { window.open('lesson.html?lesson=' + encodeURIComponent(id), '_blank'); },
    del: function (id) {
      /* عند الضغط على سلة الحذف نفتح خيارات الحذف (من الدروس فقط أو حذف نهائي) إن كان منسوخاً للدروس */
      var ex = getLesson(data, id);
      if (!ex) return;
      var matched = findMatchingResourcesAcrossUnitLessons(ex.unitId, resourcesOf(data, ex.id, null, true), ex.title);
      if (matched.resources.length > 0) {
        openUnitExerciseManageDialog(id);
        return;
      }
      if (confirm('حذف التمرين "' + ex.title + '" مع كل فيديوهاته وصوره وملفاته؟')) {
        deleteCascade('lesson', id);
        if (sel.exercise === id) sel.exercise = '';
        renderPanel(); toast('تم الحذف', 'info');
      }
    }
  });

  if (!activeExercise) return;

  var wrap = $('#exResWrap');
  wrap.innerHTML =
    '<div class="ex-editor-banner">' +
      '<div class="ex-editor-title">' +
        svgIcon('sparkles') +
        '<div><strong>فقرات ومحتوى التمرين: ' + escapeHtml(activeExercise.title) + '</strong>' +
        '<small>أضف عنواناً مع صورة أو عدة صور متتالية (القسم الأول مفتوح افتراضياً والبقية تطوى بزر السهم)، ثم انسخها أو أزلها من دروس الوحدة</small></div>' +
      '</div>' +
      '<div class="ex-editor-acts">' +
        (exList.length > 1 ? '<select class="inp" id="exQuickSwitch" style="width:auto;min-width:175px">' + unitExerciseOptions(sel.unit, activeExercise.id) + '</select>' : '') +
        (unitRegularLessons.length
          ? '<button type="button" class="btn btn-primary btn-sm" id="exSyncSingleBtn">' +
              svgIcon('copy') + ' نسخ هذا التمرين إلى دروس الوحدة (' + unitRegularLessons.length + ')' +
            '</button>'
          : '') +
        '<button type="button" class="btn btn-sm" id="exManageSingleBtn">' + svgIcon('sliders') + ' إخفاء / إزالة من الدروس</button>' +
        '<a class="btn btn-sm" href="lesson.html?lesson=' + encodeURIComponent(activeExercise.id) + '" target="_blank">' + svgIcon('eye') + ' فتح صفحة التمرين</a>' +
      '</div>' +
    '</div>' +
    '<div id="exResInner"></div>';

  var manageSingleBtn = $('#exManageSingleBtn', wrap);
  if (manageSingleBtn) {
    manageSingleBtn.addEventListener('click', function () {
      openUnitExerciseManageDialog(activeExercise.id);
    });
  }

  var quickSw = $('#exQuickSwitch', wrap);
  if (quickSw) {
    quickSw.addEventListener('change', function () {
      sel.exercise = this.value;
      renderPanel();
    });
  }

  var syncSingleBtn = $('#exSyncSingleBtn', wrap);
  if (syncSingleBtn) {
    syncSingleBtn.addEventListener('click', function () {
      if (!confirm('نسخ تمرين «' + activeExercise.title + '» بجميع عناوينه وصوره وملفاته إلى قسم «تمارين وتطبيقات» في كل دروس الوحدة (' + unitRegularLessons.length + ' درس)؟')) {
        return;
      }
      var res = syncStandaloneExercisesToUnitLessons(sel.unit, activeExercise.id);
      if (res.lessonsCount > 0) {
        toast('تم نسخ «' + activeExercise.title + '» إلى ' + res.lessonsCount + ' درس داخل الوحدة');
      }
    });
  }

  renderResourceSections($('#exResInner', wrap), activeExercise, { exerciseItemMode: true });
}

/* ---------- لوحة محتوى الدرس والتمارين ---------- */
function renderContentPanel(p) {
  if (!sel.subject) { var s0 = data.subjects.slice().sort(byOrder)[0]; if (s0) sel.subject = s0.id; }
  if (!sel.subject || !getUnit(data, sel.unit)) sel.unit = (unitsOf(data, sel.subject)[0] || {}).id || '';
  if (!sel.unit || !getLesson(data, sel.lesson) || isExerciseItem(getLesson(data, sel.lesson))) {
    sel.lesson = (lessonsOf(data, sel.unit)[0] || {}).id || '';
  }

  var lesson = getLesson(data, sel.lesson);

  p.innerHTML =
    '<h2>' + svgIcon('plus') + ' محتوى الدرس والتمارين</h2>' +
    '<p class="hint">اختر المادة ← الوحدة ← الدرس، ثم أضف الفقرات والمجموعات الديناميكية (عنوان + فيديو/ملف/صورة أو عدة صور، ثم عنوان آخر تحته...). ويمكنك نسخ أي مجموعة إلى <b>جميع الدروس داخل الوحدة</b> بنقرة واحدة.</p>' +

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
    $('#resArea').innerHTML = '<div class="empty">لا توجد دروس في هذه الوحدة — أنشئ درساً أولاً من تبويب «الدروس» (أو أضف تمارين مستقلة من تبويب «التمارين»)</div>';
    return;
  }

  renderResourceSections($('#resArea'), lesson, { exerciseItemMode: false });
}

/* ============================================================
   منشئ المجموعات الديناميكي (عنوان + عنصر أو عدة عناصر، يليه عنوان آخر...)
   يعمل لكل من: الفيديو، ملفات PDF، الصور، والتمارين المرفقة بالدرس
   ============================================================ */
var composerDrafts = {};

function makeComposerBlock(kind) {
  return {
    id: uid('blk'),
    title: '',
    exerciseType: kind === 'exercise' ? 'image' : '',
    files: [], /* [{ id, file, previewUrl }] */
    urls: ['']
  };
}

function revokeDraftBlockPreviews(blk) {
  if (!blk || !Array.isArray(blk.files)) return;
  blk.files.forEach(function (f) {
    if (f && f.previewUrl) {
      try { URL.revokeObjectURL(f.previewUrl); } catch (e) { /* تجاهل */ }
    }
  });
}

function getComposerDraft(lessonId, kind) {
  var key = lessonId + ':' + kind;
  if (!composerDrafts[key]) {
    composerDrafts[key] = {
      blocks: [makeComposerBlock(kind)],
      copyAllLessons: false,
      copyAllEx: false,
      saving: false,
      progressText: ''
    };
  }
  return composerDrafts[key];
}

function resetComposerDraft(lessonId, kind) {
  var key = lessonId + ':' + kind;
  if (composerDrafts[key] && composerDrafts[key].blocks) {
    composerDrafts[key].blocks.forEach(revokeDraftBlockPreviews);
  }
  composerDrafts[key] = {
    blocks: [makeComposerBlock(kind)],
    copyAllLessons: false,
    copyAllEx: false,
    saving: false,
    progressText: ''
  };
}

function getSectionConfig(kind, exMode) {
  if (kind === 'video') {
    return {
      kind: 'video',
      heading: exMode ? 'فيديوهات التمرين والحل' : 'الفيديوهات',
      accept: 'video/*',
      titlePlaceholder: exMode ? 'عنوان الفقرة (مثال: شرح التمرين / الطريقة الثانية للحل)' : 'عنوان الفقرة أو الفيديو (مثال: شرح الدرس / أمثلة تطبيقية)',
      urlPlaceholder: 'رابط الفيديو (يوتيوب أو رابط مباشر MP4/WebM)',
      uploadBtnLabel: 'اختيار فيديو أو عدة فيديوهات',
      addBlockLabel: 'إضافة عنوان جديد + فيديو أو عدة فيديوهات',
      itemNounPlural: 'فيديوهات'
    };
  }
  if (kind === 'pdf') {
    return {
      kind: 'pdf',
      heading: exMode ? 'ملفات التمرين والحل PDF' : 'ملفات وملخصات PDF',
      accept: 'application/pdf,.pdf',
      titlePlaceholder: exMode ? 'عنوان الفقرة (مثال: موضوع التمرين / الحل النموذجي PDF)' : 'عنوان الملخص أو المجموعة (مثال: ملخص شامل للوحدة)',
      urlPlaceholder: 'رابط ملف PDF (https://...)',
      uploadBtnLabel: 'اختيار ملف PDF أو عدة ملفات',
      addBlockLabel: 'إضافة عنوان جديد + ملف أو عدة ملفات PDF',
      itemNounPlural: 'ملفات PDF'
    };
  }
  if (kind === 'image') {
    return {
      kind: 'image',
      heading: exMode ? 'صور التمرين والحل' : 'الصور التوضيحية',
      accept: 'image/*',
      titlePlaceholder: exMode ? 'عنوان الفقرة (مثال: نص التمرين / حل الجزء الأول / حل الجزء الثاني)' : 'عنوان مجموعة الصور (مثال: مخططات الدرس / أمثلة محلولة)',
      urlPlaceholder: 'رابط الصورة (https://...)',
      uploadBtnLabel: 'اختيار صورة أو عدة صور معاً',
      addBlockLabel: 'إضافة عنوان جديد + صورة أو عدة صور أخرى',
      itemNounPlural: 'صور'
    };
  }
  return {
    kind: 'exercise',
    heading: 'التمارين المرفقة بالدرس',
    accept: 'image/*,video/*,application/pdf,.pdf',
    titlePlaceholder: 'عنوان التمرين أو الحل (مثال: حل التمرين الأول / سلسلة تطبيقية)',
    urlPlaceholder: 'الرابط (يوتيوب / صورة / PDF / موقع)',
    uploadBtnLabel: 'اختيار ملف أو عدة ملفات (صور / فيديو / PDF)',
    addBlockLabel: 'إضافة عنوان تمرين جديد + ملفاته أو صوره',
    itemNounPlural: 'عناصر'
  };
}

function renderResourceSections(area, lesson, opts) {
  opts = opts || {};
  var exMode = !!opts.exerciseItemMode;
  /* في صفحة التمارين نضع «صور التمرين والحل» أولاً في الأعلى لأنها الأكثر استخداماً لإضافة مواضيع التمارين وحلولها المصوّرة */
  var kindsList = exMode ? ['image', 'pdf', 'video'] : ['video', 'pdf', 'image', 'exercise'];
  var activeKindFilter = opts.kindFilter || 'all';
  var visibleKinds = kindsList.filter(function (k) { return activeKindFilter === 'all' || activeKindFilter === k; });

  /* فتح القسم الأول فقط افتراضياً وإبقاء بقية الأقسام مطوية بزر السهم */
  if (!adminOpenSections[lesson.id]) {
    adminOpenSections[lesson.id] = {};
    if (visibleKinds.length) adminOpenSections[lesson.id][visibleKinds[0]] = true;
  }
  if (activeKindFilter !== 'all') {
    adminOpenSections[lesson.id][activeKindFilter] = true;
  }

  var filterBarHTML = exMode
    ? '<div class="res-kind-pills" role="tablist" aria-label="أقسام محتوى التمرين">' +
        '<button type="button" class="res-kind-pill' + (activeKindFilter === 'all' ? ' active' : '') + '" data-kfilter="all">' + svgIcon('layers') + ' كل الأقسام</button>' +
        '<button type="button" class="res-kind-pill' + (activeKindFilter === 'image' ? ' active' : '') + '" data-kfilter="image">' + svgIcon('image') + ' صور التمرين والحل (' + resourcesOf(data, lesson.id, 'image').length + ')</button>' +
        '<button type="button" class="res-kind-pill' + (activeKindFilter === 'pdf' ? ' active' : '') + '" data-kfilter="pdf">' + svgIcon('file') + ' ملفات PDF (' + resourcesOf(data, lesson.id, 'pdf').length + ')</button>' +
        '<button type="button" class="res-kind-pill' + (activeKindFilter === 'video' ? ' active' : '') + '" data-kfilter="video">' + svgIcon('film') + ' فيديوهات الحل (' + resourcesOf(data, lesson.id, 'video').length + ')</button>' +
      '</div>'
    : '';

  area.innerHTML = filterBarHTML + visibleKinds.map(function (kind) {
    var cfg = getSectionConfig(kind, exMode);
    var items = resourcesOf(data, lesson.id, kind);
    var groups = groupResources(items);
    var isOpen = !!adminOpenSections[lesson.id][kind];
    return '<section class="admin-res-sec' + (isOpen ? ' is-open' : ' is-collapsed') + '" data-sec-kind="' + kind + '">' +
      '<button type="button" class="admin-sec-toggle" data-sec-toggle="' + kind + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
        '<span class="admin-sec-toggle-main">' +
          svgIcon(KIND_META[kind].icon) +
          '<span>' + cfg.heading + '</span>' +
          '<span class="cnt">' + groups.length + ' عنوان · ' + items.length + ' عنصر</span>' +
        '</span>' +
        '<span class="admin-sec-toggle-arrow">' +
          '<small>' + (isOpen ? 'إخفاء القسم' : 'إظهار المحتوى') + '</small>' +
          '<span class="acc-chevron">' + svgIcon('chevron-down') + '</span>' +
        '</span>' +
      '</button>' +
      '<div class="admin-sec-body"' + (isOpen ? '' : ' hidden') + '>' +
        '<div class="dyn-composer-mount" data-composer="' + kind + '"></div>' +
        '<div class="admin-list" id="list-' + kind + '"></div>' +
      '</div>' +
    '</section>';
  }).join('');

  $all('[data-sec-toggle]', area).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var k = btn.dataset.secToggle;
      adminOpenSections[lesson.id][k] = !adminOpenSections[lesson.id][k];
      renderResourceSections(area, lesson, opts);
    });
  });

  if (exMode) {
    $all('[data-kfilter]', area).forEach(function (btn) {
      btn.addEventListener('click', function () {
        opts.kindFilter = btn.dataset.kfilter;
        renderResourceSections(area, lesson, opts);
      });
    });
  }

  visibleKinds.forEach(function (kind) {
    if (!adminOpenSections[lesson.id][kind]) return;
    var cfg = getSectionConfig(kind, exMode);
    var compMount = $('[data-composer="' + kind + '"]', area);
    var listMount = $('#list-' + kind, area);
    renderDynamicComposer(compMount, area, lesson, kind, cfg, opts);
    renderSavedGroupsList(listMount, area, lesson, kind, cfg, opts);
  });
}

function renderDynamicComposer(mount, area, lesson, kind, cfg, opts) {
  if (!mount) return;
  var exMode = !!opts.exerciseItemMode;
  var draft = getComposerDraft(lesson.id, kind);
  if (!draft.blocks.length) draft.blocks.push(makeComposerBlock(kind));

  var blocksHTML = draft.blocks.map(function (blk, bIdx) {
    var filesStripHTML = '';
    if (blk.files.length) {
      filesStripHTML =
        '<div class="picked-strip">' +
          blk.files.map(function (pf, fIdx) {
            var isImg = pf.previewUrl || /^image\//i.test(pf.file.type || '');
            return '<div class="picked-chip">' +
              (isImg && pf.previewUrl
                ? '<img class="picked-thumb" src="' + escapeHtml(pf.previewUrl) + '" alt="">'
                : '<span class="picked-ico">' + svgIcon(KIND_META[kind === 'exercise' ? (blk.exerciseType || 'file') : kind] ? KIND_META[kind === 'exercise' ? (blk.exerciseType === 'image' ? 'image' : (blk.exerciseType === 'video' ? 'film' : 'file')) : kind].icon : 'file') + '</span>') +
              '<div class="picked-meta">' +
                '<strong>#' + (fIdx + 1) + ' — ' + escapeHtml(pf.file.name) + '</strong>' +
                '<small>' + fmtSize(pf.file.size) + '</small>' +
              '</div>' +
              '<div class="picked-acts">' +
                (blk.files.length > 1
                  ? '<button type="button" class="mini-ic-btn" data-cact="file-prev" data-b="' + bIdx + '" data-f="' + fIdx + '" title="تقديم"' + (fIdx === 0 ? ' disabled' : '') + '>' + svgIcon('chevron-right') + '</button>' +
                    '<button type="button" class="mini-ic-btn" data-cact="file-next" data-b="' + bIdx + '" data-f="' + fIdx + '" title="تأخير"' + (fIdx === blk.files.length - 1 ? ' disabled' : '') + '>' + svgIcon('chevron-left') + '</button>'
                  : '') +
                '<button type="button" class="mini-ic-btn danger" data-cact="file-del" data-b="' + bIdx + '" data-f="' + fIdx + '" title="إزالة الملف">' + svgIcon('x') + '</button>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>';
    }

    var urlsHTML = (blk.urls.length ? blk.urls : ['']).map(function (uVal, uIdx) {
      var isLast = uIdx === blk.urls.length - 1;
      return '<div class="dyn-url-row">' +
        '<input class="inp" dir="ltr" data-c-url="' + bIdx + '" data-u="' + uIdx + '" value="' + escapeHtml(uVal) + '" placeholder="' + escapeHtml(cfg.urlPlaceholder + (blk.urls.length > 1 ? ' #' + (uIdx + 1) : '')) + '"' + (draft.saving ? ' disabled' : '') + '>' +
        (blk.urls.length > 1
          ? '<button type="button" class="icon-btn danger" data-cact="url-del" data-b="' + bIdx + '" data-u="' + uIdx + '" title="حذف هذا الرابط"' + (draft.saving ? ' disabled' : '') + '>' + svgIcon('x') + '</button>'
          : '') +
        (isLast
          ? '<button type="button" class="btn btn-sm dyn-add-url-btn" data-cact="url-add" data-b="' + bIdx + '"' + (draft.saving ? ' disabled' : '') + '>' + svgIcon('plus') + ' رابط آخر</button>'
          : '') +
      '</div>';
    }).join('');

    var isBlkCollapsed = draft.blocks.length > 1 && !!blk.collapsed;
    var blkSummaryTxt = blk.title ? (' — ' + blk.title) : '';
    var blkCountTxt = (blk.files.length ? blk.files.length + ' ملف' : '') +
      (blk.urls.filter(Boolean).length ? (blk.files.length ? ' + ' : '') + blk.urls.filter(Boolean).length + ' رابط' : '');

    return '<div class="dyn-block-card' + (isBlkCollapsed ? ' is-collapsed' : '') + '">' +
      '<div class="dyn-block-head">' +
        '<span class="dyn-block-badge">' + svgIcon('sparkles') + ' الفقرة / العنوان ' + (bIdx + 1) + escapeHtml(blkSummaryTxt) +
          (blkCountTxt ? ' <small>(' + escapeHtml(blkCountTxt) + ')</small>' : '') +
        '</span>' +
        '<div class="dyn-block-tools">' +
          (draft.blocks.length > 1
            ? '<button type="button" class="btn-acc-arrow' + (!isBlkCollapsed ? ' open' : '') + '" data-cact="blk-toggle" data-b="' + bIdx + '" title="' + (isBlkCollapsed ? 'إظهار الفقرة' : 'طي الفقرة') + '">' +
                '<span>' + (isBlkCollapsed ? 'إظهار' : 'إخفاء') + '</span>' + svgIcon('chevron-down') +
              '</button>' +
              '<button type="button" class="mini-ic-btn" data-cact="blk-up" data-b="' + bIdx + '" title="تحريك الفقرة للأعلى"' + (bIdx === 0 || draft.saving ? ' disabled' : '') + '>' + svgIcon('chevron-up') + '</button>' +
              '<button type="button" class="mini-ic-btn" data-cact="blk-down" data-b="' + bIdx + '" title="تحريك الفقرة للأسفل"' + (bIdx === draft.blocks.length - 1 || draft.saving ? ' disabled' : '') + '>' + svgIcon('chevron-down') + '</button>' +
              '<button type="button" class="mini-ic-btn danger" data-cact="blk-del" data-b="' + bIdx + '" title="حذف هذه الفقرة"' + (draft.saving ? ' disabled' : '') + '>' + svgIcon('trash') + '</button>'
            : '') +
        '</div>' +
      '</div>' +

      '<div class="dyn-block-body"' + (isBlkCollapsed ? ' hidden' : '') + '>' +
        '<div class="frm-row">' +
          '<input class="inp" data-c-title="' + bIdx + '" value="' + escapeHtml(blk.title) + '" placeholder="' + escapeHtml(cfg.titlePlaceholder) + '"' + (draft.saving ? ' disabled' : '') + '>' +
          (kind === 'exercise'
            ? '<select class="inp" data-c-extype="' + bIdx + '" style="max-width:230px"' + (draft.saving ? ' disabled' : '') + '>' +
                '<option value="image"' + (blk.exerciseType === 'image' ? ' selected' : '') + '>تمرين صور (صورة أو عدة صور)</option>' +
                '<option value="pdf"' + (blk.exerciseType === 'pdf' ? ' selected' : '') + '>تمرين PDF (ملف أو عدة ملفات)</option>' +
                '<option value="video"' + (blk.exerciseType === 'video' ? ' selected' : '') + '>تمرين فيديو (فيديو أو عدة أجزاء)</option>' +
                '<option value="link"' + (blk.exerciseType === 'link' ? ' selected' : '') + '>رابط تطبيقي خارجي</option>' +
              '</select>'
            : '') +
          '<label class="btn file-label' + (draft.saving ? ' muted' : '') + '">' +
            svgIcon('upload') + ' ' + cfg.uploadBtnLabel +
            (blk.files.length ? ' (' + blk.files.length + ')' : '') +
            '<input type="file" multiple accept="' + cfg.accept + '" data-c-pick="' + bIdx + '"' + (draft.saving ? ' disabled' : '') + '>' +
          '</label>' +
        '</div>' +

        filesStripHTML +
        '<div class="dyn-urls-wrap">' + urlsHTML + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  mount.innerHTML =
    '<div class="frm-card dyn-composer-shell">' +
      '<div class="dyn-composer-hint">' +
        svgIcon('info') +
        '<span>يمكنك تحت كل <b>عنوان</b> اختيار <b>ملف واحد أو عدة ملفات معاً</b> (أو عدة روابط)، ثم الضغط على <b>«' + cfg.addBlockLabel + '»</b> لإضافة عنوان جديد تحته بترتيب ديناميكي.</span>' +
      '</div>' +
      '<div class="dyn-blocks-list">' + blocksHTML + '</div>' +
      '<div class="dyn-composer-actions">' +
        '<button type="button" class="btn dyn-new-block-btn" data-cact="blk-add"' + (draft.saving ? ' disabled' : '') + '>' +
          svgIcon('plus') + ' ' + cfg.addBlockLabel +
        '</button>' +
        '<button type="button" class="btn btn-primary" data-cact="save-all"' + (draft.saving ? ' disabled' : '') + '>' +
          (draft.saving
            ? '<span class="ai-inline-spin"></span> ' + escapeHtml(draft.progressText || 'جارٍ الرفع والحفظ...')
            : svgIcon('check') + ' حفظ وإضافة ' + (draft.blocks.length > 1 ? 'جميع الفقرات (' + draft.blocks.length + ')' : 'المحتوى')) +
        '</button>' +
      '</div>' +
      copyAllCheckboxHTML(lesson, kind, exMode, draft) +
    '</div>';

  var shell = $('.dyn-composer-shell', mount);

  /* تحديث النصوص والخيارات حياً دون إعادة رسم تفقد المؤشر */
  shell.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.cTitle !== undefined) {
      var b = +t.dataset.cTitle;
      if (draft.blocks[b]) draft.blocks[b].title = t.value;
    } else if (t.dataset.cUrl !== undefined) {
      var bu = +t.dataset.cUrl, ui = +t.dataset.u;
      if (draft.blocks[bu]) draft.blocks[bu].urls[ui] = t.value;
    }
  });

  shell.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.cExtype !== undefined) {
      var b = +t.dataset.cExtype;
      if (draft.blocks[b]) draft.blocks[b].exerciseType = t.value;
      return;
    }
    if (t.dataset.copyAll !== undefined) {
      draft.copyAllLessons = !!t.checked;
      return;
    }
    if (t.dataset.copyAllEx !== undefined) {
      draft.copyAllEx = !!t.checked;
      return;
    }
    if (t.dataset.cPick !== undefined) {
      var pb = +t.dataset.cPick;
      var blk = draft.blocks[pb];
      if (!blk || !t.files || !t.files.length) return;
      var chosen = Array.prototype.slice.call(t.files);
      chosen.forEach(function (file) {
        var pv = /^image\//i.test(file.type || '') ? URL.createObjectURL(file) : '';
        blk.files.push({ id: uid('pf'), file: file, previewUrl: pv });
      });
      if (kind === 'exercise' && chosen[0]) {
        var mime = String(chosen[0].type || '').toLowerCase();
        var fname = String(chosen[0].name || '').toLowerCase();
        if (mime.indexOf('video/') === 0 || /\.(mp4|webm|ogg|mov|mkv)$/i.test(fname)) blk.exerciseType = 'video';
        else if (mime.indexOf('image/') === 0 || /\.(png|jpe?g|webp|gif|svg)$/i.test(fname)) blk.exerciseType = 'image';
        else if (mime === 'application/pdf' || /\.pdf$/i.test(fname)) blk.exerciseType = 'pdf';
      }
      if (!blk.title.trim() && blk.files.length === 1 && !/^img[-_\d]/i.test(chosen[0].name)) {
        blk.title = chosen[0].name.replace(/\.[^.]+$/, '');
      }
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
    }
  });

  shell.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cact]');
    if (!btn || draft.saving) return;
    var act = btn.dataset.cact;
    var b = +btn.dataset.b, f = +btn.dataset.f, u = +btn.dataset.u;

    if (act === 'blk-add') {
      draft.blocks.forEach(function (prevBlk) { prevBlk.collapsed = true; });
      var freshBlk = makeComposerBlock(kind);
      freshBlk.collapsed = false;
      draft.blocks.push(freshBlk);
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
      var titleInputs = $all('[data-c-title]', mount);
      if (titleInputs.length) titleInputs[titleInputs.length - 1].focus();
    } else if (act === 'blk-toggle' && draft.blocks[b]) {
      draft.blocks[b].collapsed = !draft.blocks[b].collapsed;
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
    } else if (act === 'blk-del' && draft.blocks[b]) {
      revokeDraftBlockPreviews(draft.blocks[b]);
      draft.blocks.splice(b, 1);
      if (!draft.blocks.length) draft.blocks.push(makeComposerBlock(kind));
      if (draft.blocks.length === 1) draft.blocks[0].collapsed = false;
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
    } else if (act === 'blk-up' && b > 0) {
      var tmpB = draft.blocks[b - 1];
      draft.blocks[b - 1] = draft.blocks[b];
      draft.blocks[b] = tmpB;
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
    } else if (act === 'blk-down' && b < draft.blocks.length - 1) {
      var tmpB2 = draft.blocks[b + 1];
      draft.blocks[b + 1] = draft.blocks[b];
      draft.blocks[b] = tmpB2;
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
    } else if (act === 'file-del' && draft.blocks[b] && draft.blocks[b].files[f]) {
      var removed = draft.blocks[b].files.splice(f, 1)[0];
      if (removed && removed.previewUrl) { try { URL.revokeObjectURL(removed.previewUrl); } catch (err) {} }
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
    } else if (act === 'file-prev' && draft.blocks[b] && f > 0) {
      var arrF = draft.blocks[b].files;
      var tf = arrF[f - 1]; arrF[f - 1] = arrF[f]; arrF[f] = tf;
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
    } else if (act === 'file-next' && draft.blocks[b] && f < draft.blocks[b].files.length - 1) {
      var arrF2 = draft.blocks[b].files;
      var tf2 = arrF2[f + 1]; arrF2[f + 1] = arrF2[f]; arrF2[f] = tf2;
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
    } else if (act === 'url-add' && draft.blocks[b]) {
      draft.blocks[b].urls.push('');
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
      var urlInps = $all('[data-c-url="' + b + '"]', mount);
      if (urlInps.length) urlInps[urlInps.length - 1].focus();
    } else if (act === 'url-del' && draft.blocks[b] && draft.blocks[b].urls.length > 1) {
      draft.blocks[b].urls.splice(u, 1);
      renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
    } else if (act === 'save-all') {
      saveComposerBlocks(mount, area, lesson, kind, cfg, opts);
    }
  });
}

function saveComposerBlocks(mount, area, lesson, kind, cfg, opts) {
  var draft = getComposerDraft(lesson.id, kind);
  var nonEmptyBlocks = [];
  var totalUploads = 0;

  draft.blocks.forEach(function (blk) {
    var cleanUrls = (blk.urls || []).map(function (u) { return String(u || '').trim(); }).filter(Boolean);
    if (blk.files.length || cleanUrls.length) {
      nonEmptyBlocks.push({
        title: String(blk.title || '').trim(),
        exerciseType: kind === 'exercise' ? (blk.exerciseType || 'image') : undefined,
        files: blk.files.slice(),
        urls: cleanUrls
      });
      totalUploads += blk.files.length;
    }
  });

  if (!nonEmptyBlocks.length) {
    toast('اختر ملفاً/صورة أو الصق رابطاً واحداً على الأقل قبل الحفظ', 'err');
    return;
  }

  draft.saving = true;
  var uploadedSoFar = 0;
  draft.progressText = totalUploads ? 'جارٍ رفع الملف 1 من ' + totalUploads + '...' : 'جارٍ الحفظ...';
  renderDynamicComposer(mount, area, lesson, kind, cfg, opts);

  var maxOrder = resourcesOf(data, lesson.id, kind).reduce(function (m, r) { return Math.max(m, r.order || 0); }, 0);
  var existingGroupCount = groupResources(resourcesOf(data, lesson.id, kind)).length;
  var newlyCreated = [];

  var chain = Promise.resolve();

  nonEmptyBlocks.forEach(function (bPlan, bIdx) {
    chain = chain.then(function () {
      var groupId = uid('g');
      var fallbackTitle = bPlan.title ||
        (nonEmptyBlocks.length > 1 || existingGroupCount > 0
          ? KIND_META[kind].label + ' ' + (existingGroupCount + bIdx + 1)
          : (bPlan.urls[0] ? guessFileName(bPlan.urls[0]) : KIND_META[kind].label));
      var groupTitle = bPlan.title || fallbackTitle;
      var totalInBlock = bPlan.files.length + bPlan.urls.length;
      var itemCounter = 0;

      var blockChain = Promise.resolve();

      bPlan.files.forEach(function (pf) {
        blockChain = blockChain.then(function () {
          uploadedSoFar++;
          draft.progressText = 'جارٍ رفع الملف ' + uploadedSoFar + ' من ' + totalUploads + '...';
          var saveBtn = $('[data-cact="save-all"]', mount);
          if (saveBtn) saveBtn.innerHTML = '<span class="ai-inline-spin"></span> ' + escapeHtml(draft.progressText);

          return filePut(pf.file).then(function (fid) {
            itemCounter++;
            maxOrder++;
            var itemTitle = totalInBlock > 1 ? (groupTitle + ' (' + itemCounter + ')') : groupTitle;
            var rec = {
              id: uid('r'),
              lessonId: lesson.id,
              kind: kind,
              title: itemTitle,
              url: fid,
              size: pf.file.size || undefined,
              exerciseType: bPlan.exerciseType || undefined,
              groupId: groupId,
              groupTitle: groupTitle,
              order: maxOrder
            };
            data.resources.push(rec);
            newlyCreated.push(rec);
          });
        });
      });

      blockChain = blockChain.then(function () {
        bPlan.urls.forEach(function (uStr) {
          itemCounter++;
          maxOrder++;
          var itemTitle = totalInBlock > 1 ? (groupTitle + ' (' + itemCounter + ')') : groupTitle;
          var rec = {
            id: uid('r'),
            lessonId: lesson.id,
            kind: kind,
            title: itemTitle,
            url: uStr,
            exerciseType: bPlan.exerciseType || undefined,
            groupId: groupId,
            groupTitle: groupTitle,
            order: maxOrder
          };
          data.resources.push(rec);
          newlyCreated.push(rec);
        });
      });

      return blockChain;
    });
  });

  chain.then(function () {
    var copyLessonsFlag = draft.copyAllLessons;
    var copyExFlag = draft.copyAllEx;
    var copiedLessons = 0, copiedExs = 0;

    if (copyLessonsFlag && newlyCreated.length) {
      var otherLessons = lessonsOf(data, lesson.unitId).filter(function (l) { return l.id !== lesson.id; });
      copiedLessons = copyResourcesBundleToTargets(newlyCreated, otherLessons).targetsUpdated;
    }
    if (copyExFlag && newlyCreated.length) {
      var otherExs = unitExercisesOf(data, lesson.unitId).filter(function (x) { return x.id !== lesson.id; });
      copiedExs = copyResourcesBundleToTargets(newlyCreated, otherExs).targetsUpdated;
    }

    save();
    resetComposerDraft(lesson.id, kind);
    renderResourceSections(area, lesson, opts);

    var summaryMsg = 'تمت إضافة ' + nonEmptyBlocks.length + ' عنوان (' + newlyCreated.length + ' عنصر)';
    if (copiedLessons > 0 || copiedExs > 0) {
      var parts = [];
      if (copiedLessons > 0) parts.push(copiedLessons + ' درس');
      if (copiedExs > 0) parts.push(copiedExs + ' تمرين');
      toast(summaryMsg + ' ونسخها تلقائياً إلى ' + parts.join(' و ') + ' داخل الوحدة');
    } else {
      toast(summaryMsg + ' بنجاح');
    }
  }).catch(function (err) {
    draft.saving = false;
    draft.progressText = '';
    renderDynamicComposer(mount, area, lesson, kind, cfg, opts);
    toast('تعذّر إكمال رفع الملفات: ' + String((err && err.message) || err || ''), 'err');
  });
}

/* ============ عرض وإدارة المجموعات المضافة (عنوان + عناصره) ============ */
function rebuildOrdersFromGroups(groups) {
  var ord = 0;
  groups.forEach(function (g) {
    g.items.forEach(function (it) {
      ord++;
      it.order = ord;
    });
  });
}

function renderSavedGroupsList(listMount, area, lesson, kind, cfg, opts) {
  if (!listMount) return;
  var items = resourcesOf(data, lesson.id, kind);
  if (!items.length) {
    listMount.innerHTML = '<div class="empty">لا يوجد محتوى مضاف في هذا القسم بعد</div>';
    return;
  }

  var groups = groupResources(items);
  var openGKey = lesson.id + ':' + kind;
  if (!adminOpenGroups[openGKey]) {
    adminOpenGroups[openGKey] = {};
    if (groups[0]) adminOpenGroups[openGKey][groups[0].id] = true;
  }

  listMount.innerHTML = groups.map(function (g, gIdx) {
    var gTitle = g.title || (KIND_META[kind].label + ' ' + (gIdx + 1));
    var isGroupOpen = !!adminOpenGroups[openGKey][g.id];
    var isImgGroup = kind === 'image' || (kind === 'exercise' && (g.exerciseType || g.items[0].exerciseType) === 'image');
    var exTypeLbl = kind === 'exercise'
      ? ' · ' + ({ image: 'صور', video: 'فيديو', pdf: 'PDF', link: 'رابط' }[g.exerciseType || g.items[0].exerciseType || 'link'] || '')
      : '';

    var bodyHTML = '';
    if (isGroupOpen) {
      if (isImgGroup) {
        bodyHTML = '<div class="admin-group-thumbs">' +
          g.items.map(function (r, iIdx) {
            return '<div class="admin-thumb-card' + (r.hidden ? ' is-hidden-row' : '') + '" data-res-thumb="' + r.id + '">' +
              '<div class="admin-thumb-preview" data-gact="item-view" data-id="' + r.id + '" title="اضغط للمعاينة">' +
                '<span class="admin-thumb-idx">#' + (iIdx + 1) + (r.hidden ? ' · مخفي' : '') + '</span>' +
                '<div class="admin-thumb-ph">' + svgIcon('image') + '</div>' +
                '<img alt="' + escapeHtml(r.title || gTitle) + '" hidden>' +
              '</div>' +
              '<div class="admin-thumb-bar">' +
                (g.items.length > 1
                  ? '<button type="button" class="mini-ic-btn" data-gact="item-prev" data-g="' + gIdx + '" data-id="' + r.id + '" title="تقديم الصورة"' + (iIdx === 0 ? ' disabled' : '') + '>' + svgIcon('chevron-right') + '</button>' +
                    '<button type="button" class="mini-ic-btn" data-gact="item-next" data-g="' + gIdx + '" data-id="' + r.id + '" title="تأخير الصورة"' + (iIdx === g.items.length - 1 ? ' disabled' : '') + '>' + svgIcon('chevron-left') + '</button>'
                  : '') +
                '<button type="button" class="mini-ic-btn" data-gact="item-view" data-id="' + r.id + '" title="معاينة">' + svgIcon('eye') + '</button>' +
                '<button type="button" class="mini-ic-btn' + (r.hidden ? ' is-hidden-btn' : '') + '" data-gact="item-hide" data-id="' + r.id + '" title="' + (r.hidden ? 'إظهار الصورة للطلاب' : 'إخفاء هذه الصورة') + '">' + svgIcon(r.hidden ? 'eye-off' : 'eye') + '</button>' +
                '<button type="button" class="mini-ic-btn" data-gact="item-edit" data-id="' + r.id + '" title="تعديل الرابط أو الوصف">' + svgIcon('pencil') + '</button>' +
                '<button type="button" class="mini-ic-btn danger" data-gact="item-del" data-id="' + r.id + '" title="حذف هذه الصورة">' + svgIcon('trash') + '</button>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>';
      } else {
        bodyHTML = '<div class="admin-group-sublist">' +
          g.items.map(function (r, iIdx) {
            var srcTxt;
            if (isSbUrl(r.url)) srcTxt = svgIcon('cloud') + ' ملف في السحابة' + (r.size ? ' (' + fmtSize(r.size) + ')' : '');
            else if (isIdbUrl(r.url)) srcTxt = svgIcon('folder') + ' ملف مرفوع' + (r.size ? ' (' + fmtSize(r.size) + ')' : '');
            else if (youtubeId(r.url)) srcTxt = svgIcon('film') + ' يوتيوب';
            else srcTxt = svgIcon('link') + ' رابط خارجي';

            return '<div class="admin-subitem-row' + (r.hidden ? ' is-hidden-row' : '') + '">' +
              '<span class="admin-subitem-num">' + (iIdx + 1) + '</span>' +
              '<div class="admin-subitem-info">' +
                '<div class="admin-subitem-title">' + escapeHtml(r.title || gTitle) + hiddenPillHTML(r.hidden) + '</div>' +
                '<div class="item-sub" dir="rtl" style="text-align:right">' + srcTxt + '</div>' +
              '</div>' +
              '<div class="admin-subitem-acts">' +
                (g.items.length > 1
                  ? '<button type="button" class="mini-ic-btn" data-gact="item-prev" data-g="' + gIdx + '" data-id="' + r.id + '" title="للأعلى"' + (iIdx === 0 ? ' disabled' : '') + '>' + svgIcon('chevron-up') + '</button>' +
                    '<button type="button" class="mini-ic-btn" data-gact="item-next" data-g="' + gIdx + '" data-id="' + r.id + '" title="للأسفل"' + (iIdx === g.items.length - 1 ? ' disabled' : '') + '>' + svgIcon('chevron-down') + '</button>'
                  : '') +
                '<button type="button" class="mini-ic-btn" data-gact="item-view" data-id="' + r.id + '" title="معاينة">' + svgIcon('eye') + '</button>' +
                '<button type="button" class="mini-ic-btn' + (r.hidden ? ' is-hidden-btn' : '') + '" data-gact="item-hide" data-id="' + r.id + '" title="' + (r.hidden ? 'إظهار للطلاب' : 'إخفاء عن الطلاب') + '">' + svgIcon(r.hidden ? 'eye-off' : 'eye') + '</button>' +
                '<button type="button" class="mini-ic-btn" data-gact="item-edit" data-id="' + r.id + '" title="تعديل العنصر">' + svgIcon('pencil') + '</button>' +
                '<button type="button" class="mini-ic-btn danger" data-gact="item-del" data-id="' + r.id + '" title="حذف هذا العنصر">' + svgIcon('trash') + '</button>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>';
      }
    }

    return '<div class="res-group-admin' + (isGroupOpen ? ' is-open' : ' is-collapsed') + (g.allHidden ? ' is-hidden-row' : '') + '">' +
      '<div class="res-group-admin-head">' +
        '<div class="res-group-admin-title" data-gact="g-toggle" data-g="' + gIdx + '" style="cursor:pointer" title="اضغط لإظهار أو طي عناصر هذا العنوان">' +
          '<span class="item-ico">' + (gIdx + 1) + '</span>' +
          '<div>' +
            '<div class="item-title">' + escapeHtml(gTitle) + hiddenPillHTML(g.allHidden) + '</div>' +
            '<div class="item-sub" dir="rtl" style="text-align:right">' + g.items.length + ' عنصر تحت هذا العنوان' + exTypeLbl + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="item-acts">' +
          '<button type="button" class="btn-acc-arrow' + (isGroupOpen ? ' open' : '') + '" data-gact="g-toggle" data-g="' + gIdx + '" title="' + (isGroupOpen ? 'طي عناصر هذا العنوان' : 'إظهار عناصر هذا العنوان') + '">' +
            '<span>' + (isGroupOpen ? 'إخفاء' : 'إظهار') + '</span>' + svgIcon('chevron-down') +
          '</button>' +
          '<button type="button" class="btn-mini-add" data-gact="g-append" data-g="' + gIdx + '" title="إضافة صور أو ملفات أو روابط أخرى تحت هذا العنوان">' +
            svgIcon('plus') + '<span>إضافة لهذا العنوان</span>' +
          '</button>' +
          '<button type="button" class="btn-mini-copy" data-gact="g-copy-unit" data-g="' + gIdx + '" title="نسخ هذا العنوان بجميع عناصره إلى كل دروس الوحدة">' +
            svgIcon('copy') + '<span>نسخ لكل دروس الوحدة</span>' +
          '</button>' +
          '<button type="button" class="btn-mini-warn" data-gact="g-unit-manage" data-g="' + gIdx + '" title="إخفاء أو إزالة هذا العنوان من جميع دروس الوحدة دفعة واحدة">' +
            svgIcon('sliders') + '<span>في كل الدروس</span>' +
          '</button>' +
          '<button type="button" class="icon-btn' + (g.allHidden ? ' is-hidden-btn' : '') + '" data-gact="g-hide" data-g="' + gIdx + '" title="' + (g.allHidden ? 'إظهار العنوان للطلاب' : 'إخفاء هذا العنوان عن الطلاب') + '">' + svgIcon(g.allHidden ? 'eye-off' : 'eye') + '</button>' +
          '<button type="button" class="icon-btn" data-gact="g-copy" data-g="' + gIdx + '" title="نسخ المجموعة إلى وجهة محددة">' + svgIcon('copy') + '</button>' +
          '<button type="button" class="icon-btn" data-gact="g-up" data-g="' + gIdx + '" title="تحريك العنوان للأعلى"' + (gIdx === 0 ? ' disabled' : '') + '>' + svgIcon('chevron-up') + '</button>' +
          '<button type="button" class="icon-btn" data-gact="g-down" data-g="' + gIdx + '" title="تحريك العنوان للأسفل"' + (gIdx === groups.length - 1 ? ' disabled' : '') + '>' + svgIcon('chevron-down') + '</button>' +
          '<button type="button" class="icon-btn" data-gact="g-rename" data-g="' + gIdx + '" title="تعديل العنوان">' + svgIcon('pencil') + '</button>' +
          '<button type="button" class="icon-btn danger" data-gact="g-del" data-g="' + gIdx + '" title="حذف العنوان وكل عناصره">' + svgIcon('trash') + '</button>' +
        '</div>' +
      '</div>' +
      bodyHTML +
    '</div>';
  }).join('');

  /* تحميل مصغّرات الصور الفعلية داخل لوحة الإدارة */
  $all('[data-res-thumb]', listMount).forEach(function (card) {
    var rid = card.dataset.resThumb;
    var rObj = data.resources.find(function (x) { return x.id === rid; });
    if (!rObj) return;
    resolveSrc(rObj.url).then(function (res) {
      if (!res || res.kind === 'error' || !res.src) return;
      var imgEl = card.querySelector('img');
      var phEl = card.querySelector('.admin-thumb-ph');
      if (!imgEl) return;
      imgEl.onload = function () {
        imgEl.hidden = false;
        if (phEl) phEl.style.display = 'none';
      };
      imgEl.src = res.src;
    });
  });

  listMount.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-gact]');
    if (!btn) return;
    var act = btn.dataset.gact;
    var gIdx = +btn.dataset.g;
    var itemId = btn.dataset.id;
    var currentGroups = groupResources(resourcesOf(data, lesson.id, kind));
    var targetGroup = currentGroups[gIdx];

    if (act === 'g-toggle' && targetGroup) {
      if (!adminOpenGroups[openGKey]) adminOpenGroups[openGKey] = {};
      adminOpenGroups[openGKey][targetGroup.id] = !adminOpenGroups[openGKey][targetGroup.id];
      renderResourceSections(area, lesson, opts);
      return;
    }
    if (act === 'g-hide' && targetGroup) {
      var nextHide = !targetGroup.allHidden;
      targetGroup.items.forEach(function (it) { it.hidden = nextHide; });
      save();
      renderResourceSections(area, lesson, opts);
      toast(nextHide ? 'تم إخفاء هذا العنوان عن الطلاب' : 'تم إظهار العنوان للطلاب');
      return;
    }
    if (act === 'g-unit-manage' && targetGroup) {
      openGroupUnitManageDialog(targetGroup, lesson, kind, area, opts);
      return;
    }
    if (act === 'item-hide' && itemId) {
      var rHide = data.resources.find(function (x) { return x.id === itemId; });
      if (rHide) {
        rHide.hidden = !rHide.hidden;
        save();
        renderResourceSections(area, lesson, opts);
        toast(rHide.hidden ? 'تم إخفاء العنصر عن الطلاب' : 'تم إظهار العنصر للطلاب');
      }
      return;
    }

    if (act === 'g-up' && gIdx > 0) {
      var tmpG = currentGroups[gIdx - 1];
      currentGroups[gIdx - 1] = currentGroups[gIdx];
      currentGroups[gIdx] = tmpG;
      rebuildOrdersFromGroups(currentGroups);
      save();
      renderResourceSections(area, lesson, opts);
    } else if (act === 'g-down' && gIdx < currentGroups.length - 1) {
      var tmpG2 = currentGroups[gIdx + 1];
      currentGroups[gIdx + 1] = currentGroups[gIdx];
      currentGroups[gIdx] = tmpG2;
      rebuildOrdersFromGroups(currentGroups);
      save();
      renderResourceSections(area, lesson, opts);
    } else if (act === 'g-rename' && targetGroup) {
      var fields = [
        { key: 'title', label: 'عنوان الفقرة / المجموعة الظاهر للطلاب', value: targetGroup.title || '', placeholder: 'مثال: الحل المفصّل للتمرين' },
        { key: 'order', label: 'موضع المجموعة بين العناوين', type: 'number', value: gIdx + 1 }
      ];
      if (kind === 'exercise') {
        fields.push({
          key: 'type', label: 'نوع التمرين', type: 'select',
          value: targetGroup.exerciseType || targetGroup.items[0].exerciseType || 'image',
          options: [
            { value: 'image', label: 'صور (صورة أو عدة صور)' },
            { value: 'pdf', label: 'ملفات PDF' },
            { value: 'video', label: 'فيديو (يُشغَّل في المشغل)' },
            { value: 'link', label: 'رابط موقع' }
          ]
        });
      }
      openEditDialog({
        title: 'تعديل عنوان المجموعة', icon: KIND_META[kind].icon,
        fields: fields,
        onSave: function (v) {
          var newTitle = v.title.trim() || targetGroup.title;
          var ensureGid = targetGroup.groupId || uid('g');
          targetGroup.items.forEach(function (it, idx) {
            var oldGroupTitle = it.groupTitle || it.title || '';
            it.groupId = ensureGid;
            it.groupTitle = newTitle;
            if (targetGroup.items.length === 1 || !it.title || it.title === oldGroupTitle || it.title.indexOf(oldGroupTitle + ' (') === 0) {
              it.title = targetGroup.items.length > 1 ? (newTitle + ' (' + (idx + 1) + ')') : newTitle;
            }
            if (kind === 'exercise' && v.type) it.exerciseType = v.type;
          });
          var newPos = Math.max(0, Math.min(currentGroups.length - 1, (parseInt(v.order, 10) || (gIdx + 1)) - 1));
          if (newPos !== gIdx) {
            var moved = currentGroups.splice(gIdx, 1)[0];
            currentGroups.splice(newPos, 0, moved);
          }
          rebuildOrdersFromGroups(currentGroups);
          save();
          renderResourceSections(area, lesson, opts);
          toast('تم تحديث عنوان المجموعة');
        }
      });
    } else if (act === 'g-append' && targetGroup) {
      openAppendToGroupDialog(targetGroup, gIdx, area, lesson, kind, cfg, opts);
    } else if (act === 'g-copy-unit' && targetGroup) {
      copyGroupToAllUnitLessonsAction(targetGroup.items, targetGroup.title || KIND_META[kind].label, lesson);
    } else if (act === 'g-copy' && targetGroup) {
      openCopyBundleDialog(targetGroup.items, targetGroup.title || KIND_META[kind].label, area, lesson, opts);
    } else if (act === 'g-del' && targetGroup) {
      var gLbl = targetGroup.title || KIND_META[kind].label;
      if (confirm('حذف العنوان "' + gLbl + '" مع جميع عناصره (' + targetGroup.items.length + ')؟')) {
        var idsToDel = targetGroup.items.map(function (x) { return x.id; });
        var urlsToCheck = [];
        idsToDel.forEach(function (rid) {
          var found = data.resources.find(function (x) { return x.id === rid; });
          if (found && urlsToCheck.indexOf(found.url) === -1) urlsToCheck.push(found.url);
        });
        data.resources = data.resources.filter(function (x) { return idsToDel.indexOf(x.id) === -1; });
        urlsToCheck.forEach(releaseFileIfUnused);
        normalizeOrders(resourcesOf(data, lesson.id, kind));
        save();
        renderResourceSections(area, lesson, opts);
        toast('تم حذف المجموعة بالكامل', 'info');
      }
    } else if (act === 'item-prev' && targetGroup) {
      var idxP = targetGroup.items.findIndex(function (x) { return x.id === itemId; });
      if (idxP > 0) {
        var sw = targetGroup.items[idxP - 1];
        targetGroup.items[idxP - 1] = targetGroup.items[idxP];
        targetGroup.items[idxP] = sw;
        rebuildOrdersFromGroups(currentGroups);
        save();
        renderResourceSections(area, lesson, opts);
      }
    } else if (act === 'item-next' && targetGroup) {
      var idxN = targetGroup.items.findIndex(function (x) { return x.id === itemId; });
      if (idxN >= 0 && idxN < targetGroup.items.length - 1) {
        var sw2 = targetGroup.items[idxN + 1];
        targetGroup.items[idxN + 1] = targetGroup.items[idxN];
        targetGroup.items[idxN] = sw2;
        rebuildOrdersFromGroups(currentGroups);
        save();
        renderResourceSections(area, lesson, opts);
      }
    } else if (act === 'item-view' && itemId) {
      previewResource(itemId);
    } else if (act === 'item-edit' && itemId) {
      var rEdit = data.resources.find(function (x) { return x.id === itemId; });
      if (!rEdit) return;
      openEditDialog({
        title: 'تعديل العنصر', icon: KIND_META[rEdit.kind].icon,
        fields: [
          { key: 'title', label: 'العنوان الفرعي للعنصر', value: rEdit.title || '', placeholder: 'مثال: الصفحة 1 / الجزء الأول' },
          { key: 'url', label: 'الرابط', value: rEdit.url, dir: 'ltr', placeholder: 'https://... أو اتركه كما هو للملفات المرفوعة' }
        ],
        onSave: function (v) {
          if (v.title.trim()) rEdit.title = v.title.trim();
          if (v.url.trim()) rEdit.url = v.url.trim();
          save();
          renderResourceSections(area, lesson, opts);
          toast('تم حفظ تعديل العنصر');
        }
      });
    } else if (act === 'item-del' && itemId) {
      var rDel = data.resources.find(function (x) { return x.id === itemId; });
      if (rDel && confirm('حذف هذا العنصر من المجموعة؟')) {
        deleteCascade('resource', itemId);
        normalizeOrders(resourcesOf(data, lesson.id, kind));
        save();
        renderResourceSections(area, lesson, opts);
        toast('تم حذف العنصر', 'info');
      }
    }
  });
}

/* نافذة سريعة لإضافة صور/ملفات/روابط جديدة مباشرة داخل عنوان مجموعة موجودة */
function openAppendToGroupDialog(targetGroup, gIdx, area, lesson, kind, cfg, opts) {
  var old = document.querySelector('.modal-overlay');
  if (old) old.remove();

  var gTitle = targetGroup.title || KIND_META[kind].label;
  var pickedAppendFiles = [];
  var appendSaving = false;

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true">' +
      '<h3>' + svgIcon('plus') + ' إضافة عناصر إلى: «' + escapeHtml(gTitle) + '»</h3>' +
      '<div class="edit-form">' +
        '<div class="field">' +
          '<span>ارفع ملفاً أو عدة ملفات من الجهاز</span>' +
          '<label class="btn file-label" style="justify-content:center">' +
            svgIcon('upload') + ' ' + cfg.uploadBtnLabel +
            '<input type="file" multiple accept="' + cfg.accept + '" id="appendFilesInp">' +
          '</label>' +
          '<div id="appendPickedStrip" class="picked-strip"></div>' +
        '</div>' +
        '<label class="field">' +
          '<span>أو الصق رابطاً (أو عدة روابط، كل رابط في سطر)</span>' +
          '<textarea class="inp" id="appendUrlsTxt" rows="3" dir="ltr" placeholder="https://...\nhttps://..."></textarea>' +
        '</label>' +
        '<div class="acts">' +
          '<button type="button" class="btn" id="appendCancelBtn">' + svgIcon('x') + ' إلغاء</button>' +
          '<button type="button" class="btn btn-primary" id="appendSaveBtn">' + svgIcon('check') + ' إضافة للمجموعة</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  function cleanupAndClose() {
    pickedAppendFiles.forEach(function (pf) {
      if (pf.previewUrl) { try { URL.revokeObjectURL(pf.previewUrl); } catch (e) {} }
    });
    overlay.remove();
  }

  function renderAppendStrip() {
    var strip = $('#appendPickedStrip', overlay);
    if (!pickedAppendFiles.length) { strip.innerHTML = ''; return; }
    strip.innerHTML = pickedAppendFiles.map(function (pf, idx) {
      return '<div class="picked-chip">' +
        (pf.previewUrl ? '<img class="picked-thumb" src="' + escapeHtml(pf.previewUrl) + '" alt="">' : '<span class="picked-ico">' + svgIcon(KIND_META[kind].icon) + '</span>') +
        '<div class="picked-meta"><strong>#' + (idx + 1) + ' — ' + escapeHtml(pf.file.name) + '</strong><small>' + fmtSize(pf.file.size) + '</small></div>' +
        '<button type="button" class="mini-ic-btn danger" data-rm-ap="' + idx + '">' + svgIcon('x') + '</button>' +
      '</div>';
    }).join('');
  }

  $('#appendFilesInp', overlay).addEventListener('change', function () {
    var chosen = Array.prototype.slice.call(this.files || []);
    chosen.forEach(function (f) {
      pickedAppendFiles.push({
        file: f,
        previewUrl: /^image\//i.test(f.type || '') ? URL.createObjectURL(f) : ''
      });
    });
    renderAppendStrip();
  });

  $('#appendPickedStrip', overlay).addEventListener('click', function (e) {
    var rm = e.target.closest('[data-rm-ap]');
    if (!rm || appendSaving) return;
    var i = +rm.dataset.rmAp;
    var sp = pickedAppendFiles.splice(i, 1)[0];
    if (sp && sp.previewUrl) { try { URL.revokeObjectURL(sp.previewUrl); } catch (err) {} }
    renderAppendStrip();
  });

  overlay.addEventListener('click', function (e) { if (e.target === overlay && !appendSaving) cleanupAndClose(); });
  $('#appendCancelBtn', overlay).addEventListener('click', function () { if (!appendSaving) cleanupAndClose(); });

  $('#appendSaveBtn', overlay).addEventListener('click', function () {
    if (appendSaving) return;
    var rawUrls = ($('#appendUrlsTxt', overlay).value || '')
      .split(/\r?\n/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    if (!pickedAppendFiles.length && !rawUrls.length) {
      toast('اختر ملفاً أو الصق رابطاً واحداً على الأقل', 'err');
      return;
    }

    appendSaving = true;
    var saveBtn = $('#appendSaveBtn', overlay);
    saveBtn.disabled = true;

    var currentGroups = groupResources(resourcesOf(data, lesson.id, kind));
    var grp = currentGroups[gIdx];
    if (!grp) { cleanupAndClose(); return; }

    var gid = grp.groupId || uid('g');
    var exType = kind === 'exercise' ? (grp.exerciseType || grp.items[0].exerciseType || 'image') : undefined;
    grp.items.forEach(function (it, idx) {
      it.groupId = gid;
      it.groupTitle = gTitle;
      if (grp.items.length === 1 && (!it.title || it.title === gTitle)) {
        it.title = gTitle + ' (1)';
      } else if (!it.title) {
        it.title = gTitle + ' (' + (idx + 1) + ')';
      }
    });

    var seq = grp.items.length;
    var upIdx = 0;
    var chain = Promise.resolve();

    pickedAppendFiles.forEach(function (pf) {
      chain = chain.then(function () {
        upIdx++;
        saveBtn.innerHTML = '<span class="ai-inline-spin"></span> جارٍ الرفع (' + upIdx + '/' + pickedAppendFiles.length + ')...';
        return filePut(pf.file).then(function (fid) {
          seq++;
          var rec = {
            id: uid('r'), lessonId: lesson.id, kind: kind,
            title: gTitle + ' (' + seq + ')',
            url: fid, size: pf.file.size || undefined,
            exerciseType: exType,
            groupId: gid, groupTitle: gTitle, order: 9999
          };
          data.resources.push(rec);
          grp.items.push(rec);
        });
      });
    });

    chain.then(function () {
      rawUrls.forEach(function (uStr) {
        seq++;
        var rec = {
          id: uid('r'), lessonId: lesson.id, kind: kind,
          title: gTitle + ' (' + seq + ')',
          url: uStr,
          exerciseType: exType,
          groupId: gid, groupTitle: gTitle, order: 9999
        };
        data.resources.push(rec);
        grp.items.push(rec);
      });

      rebuildOrdersFromGroups(currentGroups);
      save();
      cleanupAndClose();
      renderResourceSections(area, lesson, opts);
      toast('تمت إضافة العناصر الجديدة تحت عنوان «' + gTitle + '»');
    }).catch(function (err) {
      appendSaving = false;
      saveBtn.disabled = false;
      saveBtn.innerHTML = svgIcon('check') + ' إضافة للمجموعة';
      toast('تعذّر الرفع: ' + String((err && err.message) || err || ''), 'err');
    });
  });
}

/* نسخ مجموعة كاملة (عنوان + كل صوره/ملفاته) إلى جميع دروس الوحدة بنقرة واحدة */
function copyGroupToAllUnitLessonsAction(groupItems, label, currentItem) {
  if (!groupItems || !groupItems.length || !currentItem) return;
  var unit = getUnit(data, currentItem.unitId);
  var targetLessons = lessonsOf(data, currentItem.unitId).filter(function (l) { return l.id !== currentItem.id; });
  if (!targetLessons.length) {
    toast('لا توجد دروس أخرى داخل هذه الوحدة لنسخ المجموعة إليها', 'info');
    return;
  }
  var unitTitle = unit ? unit.title : 'هذه الوحدة';
  var destNote = isExerciseItem(currentItem) ? ' (ضمن قسم تمارين وتطبيقات في كل درس)' : '';
  if (!confirm('نسخ "' + label + '" (' + groupItems.length + ' عنصر) إلى جميع الدروس داخل وحدة "' + unitTitle + '" (' + targetLessons.length + ' درس)' + destNote + '؟')) {
    return;
  }
  /* إذا كان النسخ من تمرين مستقل إلى الدروس ننظف أيضاً أي نسخة قديمة وضعت بالخطأ في الصور التوضيحية */
  if (isExerciseItem(currentItem)) {
    var urlMap = {};
    groupItems.forEach(function (g) { if (g.url) urlMap[g.url] = true; });
    targetLessons.forEach(function (l) {
      data.resources = data.resources.filter(function (r) {
        return !(r.lessonId === l.id && r.kind === 'image' && urlMap[r.url]);
      });
    });
  }
  var res = copyResourcesBundleToTargets(groupItems, targetLessons, { refreshExisting: true });
  if (res.targetsUpdated > 0) {
    save();
    toast('تم نسخ "' + label + '" إلى ' + res.targetsUpdated + ' درس داخل الوحدة');
  } else {
    toast('هذه المجموعة موجودة مسبقاً ومحدّثة في جميع دروس الوحدة', 'info');
  }
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

/* نافذة نسخ موسّعة للمجموعة كاملة: تدعم (جميع دروس الوحدة) أو (جميع تمارين الوحدة) أو (درس/تمرين محدد). */
function openCopyBundleDialog(bundleItems, label, area, currentLesson, opts) {
  if (!bundleItems || !bundleItems.length) return;
  var unit = getUnit(data, currentLesson.unitId);
  var unitName = unit ? unit.title : 'الوحدة الحالية';
  var unitLessons = lessonsOf(data, currentLesson.unitId).filter(function (l) { return l.id !== currentLesson.id; });
  var unitExercises = unitExercisesOf(data, currentLesson.unitId).filter(function (ex) { return ex.id !== currentLesson.id; });

  var options = [];
  if (unitLessons.length) {
    options.push({
      value: '__ALL_UNIT_LESSONS__',
      label: '⚡ جميع الدروس داخل وحدة «' + unitName + '» (' + unitLessons.length + ' درس)'
    });
  }
  if (unitExercises.length) {
    options.push({
      value: '__ALL_UNIT_EXERCISES__',
      label: '⚡ جميع التمارين داخل وحدة «' + unitName + '» (' + unitExercises.length + ' تمرين)'
    });
  }

  data.subjects.slice().sort(byOrder).forEach(function (s) {
    unitsOf(data, s.id).forEach(function (u) {
      lessonsOf(data, u.id).forEach(function (l) {
        options.push({ value: l.id, label: 'درس: ' + s.name + ' — ' + u.title + ' — ' + l.title });
      });
      unitExercisesOf(data, u.id).forEach(function (ex) {
        options.push({ value: ex.id, label: 'تمرين: ' + s.name + ' — ' + u.title + ' — ' + ex.title });
      });
    });
  });

  openEditDialog({
    title: 'نسخ «' + label + '» (' + bundleItems.length + ' عنصر)', icon: 'copy',
    fields: [{ key: 'target', label: 'اختر وجهة النسخ', type: 'select', value: options[0] ? options[0].value : currentLesson.id, options: options }],
    onSave: function (v) {
      if (v.target === '__ALL_UNIT_LESSONS__') {
        var r1 = copyResourcesBundleToTargets(bundleItems, unitLessons, { refreshExisting: true });
        if (r1.targetsUpdated) save();
        toast(r1.targetsUpdated ? 'تم النسخ إلى ' + r1.targetsUpdated + ' درس في الوحدة' : 'المجموعة موجودة مسبقاً في جميع دروس الوحدة', r1.targetsUpdated ? 'ok' : 'info');
        return;
      }
      if (v.target === '__ALL_UNIT_EXERCISES__') {
        var r2 = copyResourcesBundleToTargets(bundleItems, unitExercises, { refreshExisting: true });
        if (r2.targetsUpdated) save();
        toast(r2.targetsUpdated ? 'تم النسخ إلى ' + r2.targetsUpdated + ' تمرين في الوحدة' : 'المجموعة موجودة مسبقاً في جميع تمارين الوحدة', r2.targetsUpdated ? 'ok' : 'info');
        return;
      }
      var target = getLesson(data, v.target);
      if (!target) { toast('اختر وجهة صالحة', 'err'); return; }
      var mapped0 = mapResourceKindForTarget(bundleItems[0], target);
      var maxOrder = resourcesOf(data, target.id, mapped0.kind).reduce(function (m, r) { return Math.max(m, r.order || 0); }, 0);
      var newGid = uid('g');
      bundleItems.forEach(function (src) {
        var mapped = mapResourceKindForTarget(src, target);
        maxOrder++;
        data.resources.push({
          id: uid('r'), lessonId: target.id, kind: mapped.kind, title: src.title || '',
          url: src.url, size: src.size || undefined, exerciseType: mapped.exerciseType,
          groupId: (src.groupId || bundleItems.length > 1 || src.groupTitle) ? newGid : undefined,
          groupTitle: src.groupTitle || src.title || undefined,
          order: maxOrder
        });
      });
      save();
      if (target.id === currentLesson.id) renderResourceSections(area, currentLesson, opts);
      toast('تم نسخ المجموعة بنجاح');
    }
  });
}

function copyAllCheckboxHTML(lesson, kind, exMode, draft) {
  var unitLessons = lessonsOf(data, lesson.unitId).filter(function (l) { return l.id !== lesson.id; });
  var unitExercises = unitExercisesOf(data, lesson.unitId).filter(function (x) { return x.id !== lesson.id; });
  var itemWord = kind === 'pdf' ? (exMode ? 'الملفات' : 'الملخصات / الملفات')
    : (kind === 'exercise' ? 'التمارين' : (kind === 'image' ? 'مجموعات الصور' : 'الفيديوهات'));

  if (exMode) {
    var html = '<div class="copy-unit-bar">';
    if (unitLessons.length) {
      html += '<label class="copy-unit-check"><input type="checkbox" data-copy-all="' + kind + '"' + (draft && draft.copyAllLessons ? ' checked' : '') + '>' +
        '<span>نسخ ' + itemWord + ' تلقائياً عند الحفظ إلى <b>جميع دروس هذه الوحدة</b> (' + unitLessons.length + ' درس — قسم تمارين وتطبيقات)</span></label>';
    }
    if (unitExercises.length) {
      html += '<label class="copy-unit-check"><input type="checkbox" data-copy-all-ex="' + kind + '"' + (draft && draft.copyAllEx ? ' checked' : '') + '>' +
        '<span>نسخ أيضاً إلى <b>بقية تمارين الوحدة</b> (' + unitExercises.length + ' تمرين آخر)</span></label>';
    }
    if (!unitLessons.length && !unitExercises.length) {
      html += '<label class="copy-unit-check"><input type="checkbox" data-copy-all="' + kind + '"' + (draft && draft.copyAllLessons ? ' checked' : '') + '>' +
        '<span>نسخ ' + itemWord + ' تلقائياً عند الحفظ إلى دروس الوحدة (عند إضافة دروس)</span></label>';
    }
    html += '</div>';
    return html;
  }

  return '<div class="copy-unit-bar">' +
    '<label class="copy-unit-check">' +
      '<input type="checkbox" data-copy-all="' + kind + '"' + (draft && draft.copyAllLessons ? ' checked' : '') + '>' +
      '<span>نسخ ' + itemWord + ' تلقائياً عند الحفظ إلى <b>جميع الدروس داخل هذه الوحدة</b>' +
      (unitLessons.length ? ' (' + unitLessons.length + ' درس آخر)' : ' (عند وجود أكثر من درس في الوحدة)') + '</span>' +
    '</label>' +
  '</div>';
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
        svgIcon('film') + ' ' + data.lessons.filter(function (l) { return !isExerciseItem(l); }).length + ' درس · ' +
        svgIcon('pencil') + ' ' + data.lessons.filter(function (l) { return isExerciseItem(l); }).length + ' تمرين وحدة · ' +
        svgIcon('plus') + ' ' + data.resources.length + ' عنصر محتوى' +
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
      sel = { subject: '', unit: '', lesson: '', exercise: '' };
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
        sel = { subject: '', unit: '', lesson: '', exercise: '' };
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
      sel = { subject: '', unit: '', lesson: '', exercise: '' };
      renderPanel();
      updateCloudBadge();
      toast('تمت إعادة التعيين', 'info');
    }
  });
}
