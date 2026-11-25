/* جدول المراجعة: نسخة مستقلة قابلة للتحرير من حصص استعمال الزمن. */
'use strict';

var REVIEW_PLAN_KEY = 'ayaBacReviewPlan.v1';
var REVIEW_DRAFT_KEY = 'ayaBacReviewDraft.v1';

function loadReviewDraft() {
  try {
    var draft = JSON.parse(localStorage.getItem(REVIEW_DRAFT_KEY) || 'null');
    return isReviewPlan(draft) ? draft : null;
  } catch (e) { return null; }
}

function reviewFromSchedule(plan) {
  var result = { version: 1, columns: [], entries: [] };
  var byTime = Object.create(null);
  (plan && Array.isArray(plan.slots) ? plan.slots : []).forEach(function (slot) {
    var day = Number(slot.dayIdx);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !slot.subjectId) return;
    var time = String(slot.timeLabel || '').trim() || 'الوقت غير محدد';
    var column = byTime[time];
    if (!column) {
      column = { id: uid('period'), time: time };
      byTime[time] = column;
      result.columns.push(column);
    }
    result.entries.push({ id: uid('review'), dayIdx: day, columnId: column.id, subjectId: String(slot.subjectId) });
  });
  result.columns.sort(function (a, b) { return a.time.localeCompare(b.time); });
  return result;
}

function isReviewPlan(plan) {
  return !!plan && Array.isArray(plan.columns) && Array.isArray(plan.entries);
}

function loadReviewPlan() {
  /* عند الاتصال تُعدّ السحابة المصدر الأساسي حتى إن لم يوجد جدول محفوظ بعد. */
  var draft = loadReviewDraft();
  if (draft && (window.AYA_ADMIN_MODE || !window.CLOUD_SCHEDULE)) return draft;
  if (window.CLOUD_SCHEDULE) {
    if (isReviewPlan(window.CLOUD_SCHEDULE.review)) return JSON.parse(JSON.stringify(window.CLOUD_SCHEDULE.review));
    return reviewFromSchedule(window.CLOUD_SCHEDULE.plan);
  }
  try {
    var cached = JSON.parse(localStorage.getItem(REVIEW_PLAN_KEY) || 'null');
    if (isReviewPlan(cached)) return cached;
  } catch (e) { /* لا توجد نسخة محلية صالحة */ }
  return reviewFromSchedule(typeof loadSavedPlan === 'function' ? loadSavedPlan() : null);
}

function saveReviewPlan(plan) {
  var snapshot = JSON.parse(JSON.stringify(plan));
  if (typeof Cloud !== 'undefined' && Cloud.mode === 'cloud') {
    return Cloud.saveReviewPlan(snapshot).then(function (ok) {
      if (!ok) return false;
      window.CLOUD_SCHEDULE = window.CLOUD_SCHEDULE || { plan: null, settings: null };
      window.CLOUD_SCHEDULE.review = snapshot;
      try {
        localStorage.setItem(REVIEW_PLAN_KEY, JSON.stringify(snapshot));
        localStorage.removeItem(REVIEW_DRAFT_KEY);
      } catch (e) { /* السحابة محفوظة */ }
      return true;
    });
  }
  try {
    localStorage.setItem(REVIEW_PLAN_KEY, JSON.stringify(snapshot));
    localStorage.setItem(REVIEW_DRAFT_KEY, JSON.stringify(snapshot));
    return Promise.resolve(true);
  } catch (e) { return Promise.resolve(false); }
}

/* تغيير عنوان عمود الوقت في مكانه، دون نقل الحصص أو إنشاء عمود آخر. */
function renameReviewColumn(plan, columnId, time) {
  var column = plan.columns.find(function (c) { return c.id === columnId; });
  if (!column || plan.columns.some(function (c) { return c.id !== columnId && c.time === time; })) return false;
  column.time = time;
  return true;
}

/* وقت خاص بالحصة عند اختلافه عن عنوان العمود، دون تغيير بقية الأيام. */
function setReviewEntryTime(entry, column, time) {
  if (time === column.time) delete entry.time;
  else entry.time = time;
}

/* حذف عمود الوقت يزيل حصصه فقط؛ حذف حصة منفردة لا يحذف العمود. */
function removeReviewColumn(plan, columnId) {
  plan.columns = plan.columns.filter(function (c) { return c.id !== columnId; });
  plan.entries = plan.entries.filter(function (e) { return e.columnId !== columnId; });
}

function mountReviewGrid(root, data, admin) {
  var plan = loadReviewPlan();
  var saving = false;
  var days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  function subjectLabel(id) {
    var s = getSubject(data, id);
    return s ? s.name : 'مادة غير متاحة';
  }

  function draw() {
    if (admin && typeof preserveAdminScroll === 'function') return preserveAdminScroll(drawContent);
    return drawContent();
  }

  function drawContent() {
    var oldScroller = root.querySelector('.review-table-scroll');
    var scrollLeft = oldScroller ? oldScroller.scrollLeft : 0;
    var cols = plan.columns.slice().sort(function (a, b) { return a.time.localeCompare(b.time); });
    root.innerHTML =
      '<div class="review-heading"><div><div class="review-kicker">' + svgIcon('calendar') + ' خطتك الأسبوعية</div>' +
      '<h1>جدول المراجعة</h1><p>' + (admin
        ? 'اضغط على أي خانة لتعديل المادة ووقتها. الوقت الخاص يظهر داخل الخانة، دون تغيير بقية الأيام.'
        : 'الأيام على اليمين والأوقات في الأعلى؛ أي وقت خاص يظهر داخل خانته. مرّر الجدول أفقياً على الهاتف.') + '</p></div>' +
      (admin ? '<div class="review-actions"><button type="button" class="btn btn-primary" data-review-action="add-time">' + svgIcon('plus') + ' إضافة وقت</button>' +
        '<button type="button" class="btn" data-review-action="import">' + svgIcon('refresh') + ' نسخ استعمال الزمن</button>' +
        (loadReviewDraft() && typeof Cloud !== 'undefined' && Cloud.mode === 'cloud' ? '<button type="button" class="btn" data-review-action="publish">' + svgIcon('upload') + ' نشر التعديلات المحلية</button>' : '') +
        '<a class="btn" href="review.html" target="_blank">' + svgIcon('eye') + ' معاينة</a></div>' : '') + '</div>' +
      (admin && loadReviewDraft() ? '<div class="cloud-banner warn-banner">هذه نسخة محفوظة على هذا الجهاز ولم تُنشر بعد. عند الاتصال استخدم «نشر التعديلات المحلية» لإتاحتها للطلاب.</div>' : '') +
      (cols.length ? '<div class="review-table-scroll" tabindex="0" role="region" aria-label="جدول المراجعة، قابل للتمرير أفقياً">' +
        '<table class="review-table" style="min-width:' + (105 + cols.length * 160) + 'px"><thead><tr><th scope="col" class="review-day">اليوم</th>' +
        cols.map(function (col) {
          return '<th scope="col"><span dir="ltr" class="review-time">' + escapeHtml(col.time) + '</span>' +
            (admin ? '<span class="review-time-actions"><button type="button" class="review-time-edit" data-review-action="edit-time" data-col="' + escapeHtml(col.id) + '" title="تعديل الوقت" aria-label="تعديل الوقت ' + escapeHtml(col.time) + '">' + svgIcon('pencil') + '</button>' +
              '<button type="button" class="review-time-delete" data-review-action="delete-time" data-col="' + escapeHtml(col.id) + '" title="حذف عمود الوقت" aria-label="حذف عمود الوقت ' + escapeHtml(col.time) + '">' + svgIcon('trash') + '</button></span>' : '') + '</th>';
        }).join('') + '</tr></thead><tbody>' + days.map(function (day, dayIdx) {
          return '<tr><th scope="row" class="review-day">' + day + '</th>' + cols.map(function (col) {
            var entries = plan.entries.filter(function (e) { return e.dayIdx === dayIdx && e.columnId === col.id; });
            var cards = entries.map(function (entry) {
              var subject = getSubject(data, entry.subjectId);
              var content = '<span class="review-cell-text"><span>' + escapeHtml(subjectLabel(entry.subjectId)) + '</span>' +
                (entry.time ? '<small class="review-cell-time" dir="ltr">' + escapeHtml(entry.time) + '</small>' : '') + '</span>';
              var color = subject && /^[a-z-]+$/.test(subject.color || '') ? ' c-' + subject.color : '';
              return admin
                ? '<div class="review-cell-wrap"><button type="button" class="review-cell review-filled' + color + '" data-review-action="edit-cell" data-id="' + escapeHtml(entry.id) + '" data-day="' + dayIdx + '" data-col="' + escapeHtml(col.id) + '" aria-label="تعديل ' + escapeHtml(subjectLabel(entry.subjectId)) + ' يوم ' + day + ' في ' + escapeHtml(entry.time || col.time) + '">' + content + svgIcon('pencil') + '</button>' +
                  '<button type="button" class="review-cell-delete" data-review-action="delete-cell" data-id="' + escapeHtml(entry.id) + '" title="حذف الحصة" aria-label="حذف حصة ' + escapeHtml(subjectLabel(entry.subjectId)) + ' يوم ' + day + '">' + svgIcon('trash') + '</button></div>'
                : '<div class="review-cell review-filled' + color + '">' + content + '</div>';
            }).join('');
            if (admin && !entries.length) cards = '<button type="button" class="review-cell review-empty" data-review-action="edit-cell" data-day="' + dayIdx + '" data-col="' + escapeHtml(col.id) + '" aria-label="إضافة مادة يوم ' + day + ' في ' + escapeHtml(col.time) + '">' + svgIcon('plus') + '<span>إضافة</span></button>';
            if (!cards) cards = '<span class="review-dash" aria-label="لا توجد حصة">—</span>';
            return '<td>' + cards + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty review-empty-state">' + (admin ? 'لا توجد أوقات بعد. أضف وقتاً أو انسخ الحصص من استعمال الزمن.' : 'لم تضف الإدارة جدول مراجعة بعد.') + '</div>');
    var newScroller = root.querySelector('.review-table-scroll');
    if (newScroller) newScroller.scrollLeft = scrollLeft;
  }

  function persist(next, onSuccess, dialog) {
    if (saving) return;
    saving = true;
    var buttons = dialog ? dialog.querySelectorAll('button') : [];
    Array.from(buttons).forEach(function (b) { b.disabled = true; });
    saveReviewPlan(next).then(function (ok) {
      if (!ok) { toast('تعذّر حفظ جدول المراجعة. تحقق من الاتصال وحاول مجدداً.', 'err'); return; }
      plan = next;
      if (dialog) dialog.remove();
      draw();
      toast(typeof Cloud !== 'undefined' && Cloud.mode === 'cloud' ? 'تم حفظ جدول المراجعة ومزامنته' : 'تم حفظ الجدول على هذا الجهاز فقط؛ أعد حفظه بعد الاتصال لمزامنته', 'ok');
      if (onSuccess) onSuccess();
    }).catch(function () { toast('تعذّر حفظ جدول المراجعة. حاول مجدداً.', 'err'); }).finally(function () {
      saving = false;
      Array.from(buttons).forEach(function (b) { b.disabled = false; });
    });
  }

  function deleteReviewEntry(entry, dialog) {
    if (!confirm('حذف هذه الحصة من جدول المراجعة؟ سيبقى عمود الوقت.')) return;
    var next = JSON.parse(JSON.stringify(plan));
    next.entries = next.entries.filter(function (e) { return e.id !== entry.id; });
    persist(next, null, dialog);
  }

  function deleteReviewColumn(col, dialog) {
    var count = plan.entries.filter(function (e) { return e.columnId === col.id; }).length;
    var message = 'حذف عمود الوقت «' + col.time + '»؟';
    if (count) message += ' سيُحذف معه ' + count + ' حصة في جميع الأيام.';
    if (!confirm(message)) return;
    var next = JSON.parse(JSON.stringify(plan));
    removeReviewColumn(next, col.id);
    persist(next, null, dialog);
  }

  function editDialog(mode, dayIdx, col, entry) {
    if (saving) return;
    var dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    var heading = mode === 'cell' ? (entry ? 'تعديل الحصة' : 'إضافة حصة') : (col ? 'تعديل الوقت' : 'إضافة وقت');
    var selected = entry ? entry.subjectId : '';
    var subjectOptions = '<option value="">اختر المادة</option>' + (data.subjects || []).slice().sort(byOrder).map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '"' + (s.id === selected ? ' selected' : '') + '>' + escapeHtml(s.name) + (s.hidden ? ' (مخفية)' : '') + '</option>';
    }).join('');
    if (selected && !(data.subjects || []).some(function (s) { return s.id === selected; })) subjectOptions += '<option selected value="' + escapeHtml(selected) + '">مادة غير متاحة</option>';
    dialog.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="reviewDialogTitle">' +
      '<h3 id="reviewDialogTitle">' + svgIcon('calendar') + ' ' + heading + '</h3>' +
      (mode === 'cell' ? '<p class="hint">' + days[dayIdx] + ' — وقت هذه الحصة مستقل عن بقية الأيام ويظهر داخل الخانة إن اختلف عن وقت العمود.</p>' :
        '<p class="hint">' + (col ? 'تعديل الوقت يغيّره للحصص التي تتبع وقت العمود، دون تغيير الأوقات الخاصة بالخانات.' : 'أضف وقتاً لتتمكن من ملء خاناته.') + '</p>') +
      '<form class="review-form">' + (mode === 'cell' ? '<label class="field"><span>المادة</span><select class="inp" name="subject" required>' + subjectOptions + '</select></label>' : '') +
      '<label class="field"><span>الوقت</span><input class="inp" name="time" dir="ltr" maxlength="80" required placeholder="08:30 - 10:30" value="' + escapeHtml(entry && entry.time ? entry.time : (col ? col.time : '')) + '"></label>' +
      '<p class="hint">مثال: 08:30 - 10:30</p><div class="review-dialog-error" role="alert" hidden></div>' +
      '<div class="acts"><button type="button" class="btn" data-review-close>إلغاء</button>' +
      (entry ? '<button type="button" class="btn btn-danger" data-review-delete>حذف الحصة</button>' : '') +
      (mode === 'time' && col ? '<button type="button" class="btn btn-danger" data-review-delete-time>حذف عمود الوقت</button>' : '') +
      '<button type="submit" class="btn btn-primary">حفظ</button></div></form></div>';
    document.body.appendChild(dialog);
    var form = dialog.querySelector('form');
    var error = dialog.querySelector('.review-dialog-error');
    function showError(message) { error.textContent = message; error.hidden = false; }
    function close() { if (!saving) dialog.remove(); }
    dialog.querySelector('[data-review-close]').addEventListener('click', close);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    dialog.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    var deleteEntry = dialog.querySelector('[data-review-delete]');
    if (deleteEntry) deleteEntry.addEventListener('click', function () { deleteReviewEntry(entry, dialog); });
    var deleteTime = dialog.querySelector('[data-review-delete-time]');
    if (deleteTime) deleteTime.addEventListener('click', function () { deleteReviewColumn(col, dialog); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var time = form.elements.time.value.trim();
      var subjectId = mode === 'cell' ? form.elements.subject.value : '';
      if (!time || (mode === 'cell' && !subjectId)) { showError('يرجى اختيار المادة وكتابة الوقت.'); return; }
      var next = JSON.parse(JSON.stringify(plan));
      if (mode === 'time') {
        var existingTime = next.columns.find(function (c) { return c.time === time; });
        if (existingTime && (!col || existingTime.id !== col.id)) {
          showError('هذا الوقت موجود بالفعل في عمود آخر.'); return;
        }
        if (col && time !== col.time) {
          var affectedCount = plan.entries.filter(function (item) {
            return item.columnId === col.id && !item.time;
          }).length;
          if (affectedCount && !confirm('تغيير وقت العمود سيغيّر وقت ' + affectedCount + ' حصة تتبعه. الأوقات الخاصة بالخانات لن تتغير. هل تريد المتابعة؟')) return;
          if (!renameReviewColumn(next, col.id, time)) { showError('تعذّر تعديل الوقت.'); return; }
        }
        if (!col) next.columns.push({ id: uid('period'), time: time });
      } else if (entry) {
        var existing = next.entries.find(function (item) { return item.id === entry.id; });
        existing.subjectId = subjectId;
        setReviewEntryTime(existing, col, time);
      } else {
        var added = { id: uid('review'), dayIdx: dayIdx, columnId: col.id, subjectId: subjectId };
        setReviewEntryTime(added, col, time);
        next.entries.push(added);
      }
      persist(next, null, dialog);
    });
    var first = form.querySelector('select, input');
    if (first) first.focus();
  }

  root.addEventListener('click', function (e) {
    if (!admin || saving) return;
    var btn = e.target.closest('[data-review-action]');
    if (!btn || !root.contains(btn)) return;
    var action = btn.dataset.reviewAction;
    var col = plan.columns.find(function (c) { return c.id === btn.dataset.col; });
    var entry = plan.entries.find(function (item) { return item.id === btn.dataset.id; });
    if (action === 'publish') {
      if (confirm('نشر النسخة المحلية واستبدال جدول المراجعة المنشور؟')) persist(plan);
    } else if (action === 'add-time') editDialog('time', null, null, null);
    else if (action === 'edit-time' && col) editDialog('time', null, col, null);
    else if (action === 'delete-time' && col) deleteReviewColumn(col);
    else if (action === 'delete-cell' && entry) deleteReviewEntry(entry);
    else if (action === 'edit-cell' && col) editDialog('cell', Number(btn.dataset.day), col, entry);
    else if (action === 'import') {
      if (!confirm('نسخ الحصص الحالية من استعمال الزمن واستبدال جدول المراجعة؟ لا يتغير استعمال الزمن الأصلي.')) return;
      var source = typeof loadSavedPlan === 'function' ? loadSavedPlan() : null;
      if (!source || !source.slots || !source.slots.length) { toast('لا توجد حصص في استعمال الزمن لنسخها.', 'info'); return; }
      persist(reviewFromSchedule(source));
    }
  });
  draw();
}

function renderAdminReviewPanel(panel, data) {
  panel.innerHTML = '<div id="adminReviewRoot"></div>';
  mountReviewGrid(document.getElementById('adminReviewRoot'), data, true);
}

function initReviewPage() {
  var data = loadData();
  document.getElementById('crumbs').innerHTML = breadcrumb([{ label: 'الرئيسية', href: 'home.html', icon: 'home' }, { label: 'جدول المراجعة' }]);
  mountReviewGrid(document.getElementById('studentReviewRoot'), data, false);
  var out = document.getElementById('logoutBtn');
  if (out) out.addEventListener('click', doLogout);
}
