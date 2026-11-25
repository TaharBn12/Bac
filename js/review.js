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
  var result = { version: 2, columns: [], entries: [] };
  var byTime = { week: Object.create(null), weekend: Object.create(null) };
  (plan && Array.isArray(plan.slots) ? plan.slots : []).forEach(function (slot) {
    var day = Number(slot.dayIdx);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !slot.subjectId) return;
    var time = String(slot.timeLabel || '').trim() || 'الوقت غير محدد';
    var group = day >= 4 ? 'weekend' : 'week';
    var column = byTime[group][time];
    if (!column) {
      column = { id: uid('period'), time: time, group: group };
      byTime[group][time] = column;
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

var REVIEW_DAY_GROUPS = [
  { id: 'week', title: 'الأحد إلى الأربعاء', days: [0, 1, 2, 3] },
  { id: 'weekend', title: 'الخميس والجمعة والسبت', days: [4, 5, 6] }
];
var REVIEW_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/* ترحيل غير هدّام للجداول القديمة: ينسخ كل عمود لكل مجموعة ويحافظ على الحصص وأوقاتها. */
function splitReviewGroups(original) {
  var plan = JSON.parse(JSON.stringify(original));
  var mapping = Object.create(null);
  var used = Object.create(null);
  plan.columns.forEach(function (c) { used[c.id] = true; });
  var columns = [];
  plan.columns.forEach(function (col) {
    if (col.group === 'week' || col.group === 'weekend') { columns.push(col); return; }
    var first = Object.assign({}, col, { group: 'week' });
    var id;
    do { id = uid('period'); } while (used[id]);
    used[id] = true;
    var second = Object.assign({}, col, { id: id, group: 'weekend' });
    mapping[col.id] = { week: first.id, weekend: second.id };
    columns.push(first, second);
  });
  plan.entries.forEach(function (entry) {
    if (mapping[entry.columnId]) {
      entry.columnId = mapping[entry.columnId][entry.dayIdx >= 4 ? 'weekend' : 'week'];
    }
  });
  plan.columns = columns;
  plan.version = 2;
  return plan;
}

/* تجميع قابل للتخصيص؛ تُنسخ الأعمدة عند فصل يوم حتى لا تتأثر بقية الأيام. */
function reviewGroupTitle(days) {
  if (days.length === 1) return REVIEW_DAYS[days[0]];
  return days.map(function (day) { return REVIEW_DAYS[day]; }).join('، ');
}
function reviewGroups(plan) {
  var groups = Array.isArray(plan.groups) ? plan.groups : REVIEW_DAY_GROUPS;
  return groups.map(function (g) { return { id: g.id, days: g.days.slice(), title: reviewGroupTitle(g.days) }; })
    .sort(function (a, b) { return a.days[0] - b.days[0]; });
}
function splitReviewDay(plan, day) {
  var group = plan.groups.find(function (g) { return g.days.indexOf(day) !== -1; });
  if (!group || group.days.length < 2) return false;
  var groupId = 'day-' + day;
  if (plan.groups.some(function (g) { return g.id === groupId; })) groupId = uid('group');
  var used = Object.create(null);
  plan.columns.forEach(function (c) { used[c.id] = true; });
  var map = Object.create(null);
  var copies = plan.columns.filter(function (c) { return c.group === group.id; }).map(function (col) {
    var id; do { id = uid('period'); } while (used[id]);
    used[id] = true; map[col.id] = id;
    return Object.assign({}, col, { id: id, group: groupId });
  });
  plan.columns = plan.columns.concat(copies);
  plan.entries.forEach(function (entry) {
    if (entry.dayIdx === day && map[entry.columnId]) entry.columnId = map[entry.columnId];
  });
  group.days = group.days.filter(function (d) { return d !== day; });
  plan.groups.push({ id: groupId, days: [day] });
  plan.version = 3;
  return true;
}
function prepareReviewPlan(original) {
  if (Array.isArray(original.groups)) return JSON.parse(JSON.stringify(original));
  var plan = splitReviewGroups(original);
  plan.groups = REVIEW_DAY_GROUPS.map(function (g) { return { id: g.id, days: g.days.slice() }; });
  splitReviewDay(plan, 4);
  plan.version = 3;
  return plan;
}
function reviewColor(plan, entry) {
  var color = entry.color || (plan.subjectColors && plan.subjectColors[entry.subjectId]);
  return /^#[0-9a-f]{6}$/i.test(color || '') ? color : '';
}
function reviewTextColor(color) {
  var r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#17152a' : '#ffffff';
}
function setReviewColor(plan, entry, color, all) {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) color = '';
  if (all) {
    plan.subjectColors = plan.subjectColors || {};
    if (color) plan.subjectColors[entry.subjectId] = color;
    else delete plan.subjectColors[entry.subjectId];
    plan.entries.forEach(function (item) { if (item.subjectId === entry.subjectId) delete item.color; });
  } else if (color) entry.color = color;
  else delete entry.color;
}

/* تغيير عنوان عمود الوقت في مكانه، دون نقل الحصص أو إنشاء عمود آخر. */
function renameReviewColumn(plan, columnId, time) {
  var column = plan.columns.find(function (c) { return c.id === columnId; });
  if (!column || plan.columns.some(function (c) { return c.id !== columnId && c.group === column.group && c.time === time; })) return false;
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
  var plan = prepareReviewPlan(loadReviewPlan());
  var saving = false;
  var days = REVIEW_DAYS;

  function subjectLabel(id) {
    var s = getSubject(data, id);
    return s ? s.name : 'مادة غير متاحة';
  }

  function draw() {
    if (admin && typeof preserveAdminScroll === 'function') return preserveAdminScroll(drawContent);
    return drawContent();
  }

  function drawContent() {
    var offsets = {};
    $all('.review-table-scroll', root).forEach(function (el) { offsets[el.dataset.group] = el.scrollLeft; });
    root.innerHTML =
      '<div class="review-heading"><div><div class="review-kicker">' + svgIcon('calendar') + ' خطتك الأسبوعية</div>' +
      '<h1>جدول المراجعة</h1><p>' + (admin
        ? 'افصل أي يوم لتخصيص أوقاته، واضغط على الخانة لتعديل المادة واللون.'
        : 'لكل مجموعة أيام أوقاتها الخاصة. مرّر الجدول أفقياً على الهاتف.') + '</p></div>' +
      '<div class="review-actions"><button type="button" class="btn review-image-btn" data-review-action="show-image">' + svgIcon('image') + ' عرض صورة الجدول</button>' +
      (admin ? '<button type="button" class="btn" data-review-action="import">' + svgIcon('refresh') + ' نسخ استعمال الزمن</button>' +
        (loadReviewDraft() && typeof Cloud !== 'undefined' && Cloud.mode === 'cloud' ? '<button type="button" class="btn" data-review-action="publish">' + svgIcon('upload') + ' نشر التعديلات المحلية</button>' : '') +
        '<a class="btn" href="review.html" target="_blank" rel="noopener">' + svgIcon('eye') + ' معاينة</a>' : '') + '</div></div>' +
      (admin && loadReviewDraft() ? '<div class="cloud-banner warn-banner">هذه نسخة محفوظة على هذا الجهاز ولم تُنشر بعد. عند الاتصال استخدم «نشر التعديلات المحلية» لإتاحتها للطلاب.</div>' : '') +
      reviewGroups(plan).map(renderGroup).join('');
    $all('.review-table-scroll', root).forEach(function (el) {
      if (Object.prototype.hasOwnProperty.call(offsets, el.dataset.group)) el.scrollLeft = offsets[el.dataset.group];
    });
  }

  function renderGroup(group) {
    var cols = plan.columns.filter(function (c) { return c.group === group.id; }).sort(function (a, b) { return a.time.localeCompare(b.time); });
    var head = '<section class="review-day-group" data-review-group="' + escapeHtml(group.id) + '">' +
      '<div class="review-group-head"><div><span class="review-group-kicker">' + svgIcon('clock') + ' أوقات مستقلة</span><h2>' + group.title + '</h2></div>' +
      (admin ? '<div class="review-group-actions">' + (group.days.length > 1 ? group.days.map(function (day) { return '<button type="button" class="btn btn-sm" data-review-action="split-day" data-day="' + day + '">فصل ' + days[day] + '</button>'; }).join('') : '') + '<button type="button" class="btn btn-sm" data-review-action="add-time" data-group="' + escapeHtml(group.id) + '">' + svgIcon('plus') + ' إضافة وقت</button></div>' : '') + '</div>';
    if (!cols.length) return head + '<div class="empty review-empty-state">' + (admin ? 'لا توجد أوقات لهذه الأيام بعد. اضغط «إضافة وقت».' : 'لا توجد حصص في هذه الأيام بعد.') + '</div></section>';
    return head + '<div class="review-table-scroll" data-group="' + escapeHtml(group.id) + '" tabindex="0" role="region" aria-label="جدول ' + group.title + '، قابل للتمرير أفقياً">' +
      '<table class="review-table" style="min-width:' + (105 + cols.length * 160) + 'px"><thead><tr><th scope="col" class="review-day">اليوم</th>' +
      cols.map(function (col) {
        return '<th scope="col"><span dir="ltr" class="review-time">' + escapeHtml(col.time) + '</span>' +
          (admin ? '<span class="review-time-actions"><button type="button" class="review-time-edit" data-review-action="edit-time" data-col="' + escapeHtml(col.id) + '" title="تعديل الوقت" aria-label="تعديل الوقت ' + escapeHtml(col.time) + '، ' + group.title + '">' + svgIcon('pencil') + '</button>' +
          '<button type="button" class="review-time-delete" data-review-action="delete-time" data-col="' + escapeHtml(col.id) + '" title="حذف عمود الوقت" aria-label="حذف عمود الوقت ' + escapeHtml(col.time) + '، ' + group.title + '">' + svgIcon('trash') + '</button></span>' : '') + '</th>';
      }).join('') + '</tr></thead><tbody>' + group.days.map(function (dayIdx) {
        var day = days[dayIdx];
        return '<tr><th scope="row" class="review-day">' + day + '</th>' + cols.map(function (col) {
          var entries = plan.entries.filter(function (e) { return e.dayIdx === dayIdx && e.columnId === col.id; });
          var cards = entries.map(function (entry) {
            var subject = getSubject(data, entry.subjectId);
            var content = '<span class="review-cell-text"><span>' + escapeHtml(subjectLabel(entry.subjectId)) + '</span>' +
              (entry.time ? '<small class="review-cell-time" dir="ltr">' + escapeHtml(entry.time) + '</small>' : '') + '</span>';
            var color = subject && /^[a-z-]+$/.test(subject.color || '') ? ' c-' + subject.color : '';
            var customColor = reviewColor(plan, entry);
            var colorStyle = customColor ? ' style="background:' + customColor + ';color:' + reviewTextColor(customColor) + '"' : '';
            return admin
              ? '<div class="review-cell-wrap"><button type="button" class="review-cell review-filled' + color + '"' + colorStyle + ' data-review-action="edit-cell" data-id="' + escapeHtml(entry.id) + '" data-day="' + dayIdx + '" data-col="' + escapeHtml(col.id) + '" aria-label="تعديل ' + escapeHtml(subjectLabel(entry.subjectId)) + ' يوم ' + day + ' في ' + escapeHtml(entry.time || col.time) + '">' + content + svgIcon('pencil') + '</button>' +
                '<button type="button" class="review-cell-delete" data-review-action="delete-cell" data-id="' + escapeHtml(entry.id) + '" title="حذف الحصة" aria-label="حذف حصة ' + escapeHtml(subjectLabel(entry.subjectId)) + ' يوم ' + day + '">' + svgIcon('trash') + '</button></div>'
              : '<div class="review-cell review-filled' + color + '"' + colorStyle + '>' + content + '</div>';
          }).join('');
          if (admin && !entries.length) cards = '<button type="button" class="review-cell review-empty" data-review-action="edit-cell" data-day="' + dayIdx + '" data-col="' + escapeHtml(col.id) + '" aria-label="إضافة مادة يوم ' + day + ' في ' + escapeHtml(col.time) + '">' + svgIcon('plus') + '<span>إضافة</span></button>';
          if (!cards) cards = '<span class="review-dash" aria-label="لا توجد حصة">—</span>';
          return '<td>' + cards + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></section>';
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

  function editDialog(mode, dayIdx, col, entry, groupId) {
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
      '<p class="hint">مثال: 08:30 - 10:30</p>' + (mode === 'cell' ? '<label class="field"><span>لون الخانة</span><select class="inp" name="colorMode"><option value="default">اللون الافتراضي للمادة</option><option value="custom"' + (entry && reviewColor(plan, entry) ? ' selected' : '') + '>لون مخصص</option></select></label>' +
      '<label class="field review-color-field"><span>اختر اللون</span><input type="color" name="color" value="' + (entry && reviewColor(plan, entry) || '#8060dc') + '"></label>' +
      '<label class="field"><span>تطبيق اللون على</span><select class="inp" name="colorScope"><option value="cell">هذه الخانة فقط</option><option value="subject">كل خانات هذه المادة، بما فيها الحصص الجديدة</option></select></label>' : '') +
      '<div class="review-dialog-error" role="alert" hidden></div>' +
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
        var existingTime = next.columns.find(function (c) { return c.group === (col ? col.group : groupId) && c.time === time; });
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
        if (!col) next.columns.push({ id: uid('period'), time: time, group: groupId });
      } else if (entry) {
        var existing = next.entries.find(function (item) { return item.id === entry.id; });
        if (existing.subjectId !== subjectId) delete existing.color;
        existing.subjectId = subjectId;
        setReviewEntryTime(existing, col, time);
        setReviewColor(next, existing, form.elements.colorMode.value === 'custom' ? form.elements.color.value : '', form.elements.colorScope.value === 'subject');
      } else {
        var added = { id: uid('review'), dayIdx: dayIdx, columnId: col.id, subjectId: subjectId };
        setReviewEntryTime(added, col, time);
        next.entries.push(added);
        setReviewColor(next, added, form.elements.colorMode.value === 'custom' ? form.elements.color.value : '', form.elements.colorScope.value === 'subject');
      }
      persist(next, null, dialog);
    });
    var first = form.querySelector('select, input');
    if (first) first.focus();
  }

  root.addEventListener('click', function (e) {
    if (saving) return;
    var btn = e.target.closest('[data-review-action]');
    if (!btn || !root.contains(btn)) return;
    var action = btn.dataset.reviewAction;
    if (action === 'show-image') { showReviewImage(plan, data); return; }
    if (!admin) return;
    var col = plan.columns.find(function (c) { return c.id === btn.dataset.col; });
    var entry = plan.entries.find(function (item) { return item.id === btn.dataset.id; });
    if (action === 'publish') {
      if (confirm('نشر النسخة المحلية واستبدال جدول المراجعة المنشور؟')) persist(plan);
    } else if (action === 'split-day') {
      var day = Number(btn.dataset.day);
      if (!confirm('فصل يوم ' + days[day] + '؟ ستُنسخ أوقاته الحالية لتعديلها مستقلة دون تغيير بقية الأيام.')) return;
      var next = JSON.parse(JSON.stringify(plan));
      if (splitReviewDay(next, day)) persist(next);
    } else if (action === 'add-time' && reviewGroups(plan).some(function (g) { return g.id === btn.dataset.group; })) editDialog('time', null, null, null, btn.dataset.group);
    else if (action === 'edit-time' && col) editDialog('time', null, col, null);
    else if (action === 'delete-time' && col) deleteReviewColumn(col);
    else if (action === 'delete-cell' && entry) deleteReviewEntry(entry);
    else if (action === 'edit-cell' && col) editDialog('cell', Number(btn.dataset.day), col, entry);
    else if (action === 'import') {
      if (!confirm('نسخ الحصص الحالية من استعمال الزمن واستبدال جدول المراجعة؟ لا يتغير استعمال الزمن الأصلي.')) return;
      var source = typeof loadSavedPlan === 'function' ? loadSavedPlan() : null;
      if (!source || !source.slots || !source.slots.length) { toast('لا توجد حصص في استعمال الزمن لنسخها.', 'info'); return; }
      persist(prepareReviewPlan(reviewFromSchedule(source)));
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

/* صورة أفقية تُرسم محلياً من البيانات الفعلية، دون إرسال الجدول إلى خدمة خارجية. */
function reviewImageLines(ctx, value, maxWidth) {
  var words = String(value || '').trim().split(/\s+/).filter(Boolean);
  var lines = [], line = '';
  words.forEach(function (word) {
    var candidate = line ? line + ' ' + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) { line = candidate; return; }
    if (line) { lines.push(line); line = ''; }
    /* الكلمات الطويلة جداً تُقسَّم كي لا تختفي خارج الخانة. */
    Array.from(word).forEach(function (character) {
      if (line && ctx.measureText(line + character).width > maxWidth) { lines.push(line); line = ''; }
      line += character;
    });
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function buildReviewCanvas(plan, data) {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('لا يدعم المتصفح إنشاء صورة للجدول');
  var groups = reviewGroups(plan).map(function (group) {
    return {
      group: group,
      columns: plan.columns.filter(function (c) { return c.group === group.id; }).slice().sort(function (a, b) { return a.time.localeCompare(b.time); })
    };
  });
  var maxCols = Math.max.apply(null, [1].concat(groups.map(function (g) { return g.columns.length; })));
  var width = Math.max(2000, 160 + 190 + maxCols * 250);
  if (width > 8000) throw new Error('الجدول عريض جداً لإنشاء صورة؛ قلّل عدد أعمدة الوقت.');

  function layout(w) {
    var contentWidth = w - 160, dayWidth = 190;
    var y = 200;
    return groups.map(function (section) {
      var n = Math.max(1, section.columns.length);
      var cw = (contentWidth - dayWidth) / n;
      ctx.font = '700 24px Cairo, sans-serif';
      var headerLines = section.columns.map(function (col) { return reviewImageLines(ctx, col.time, cw - 24); });
      var headerHeight = Math.max(68, 22 + Math.max.apply(null, [1].concat(headerLines.map(function (l) { return l.length; }))) * 30);
      var rows = section.group.days.map(function (dayIdx) {
        var cells = section.columns.map(function (col) {
          return plan.entries.filter(function (e) { return e.dayIdx === dayIdx && e.columnId === col.id; }).map(function (entry) {
            var subject = getSubject(data, entry.subjectId);
            ctx.font = '700 25px Cairo, sans-serif';
            var name = reviewImageLines(ctx, subject ? subject.name : 'مادة غير متاحة', cw - 32);
            ctx.font = '600 20px Cairo, sans-serif';
            var time = entry.time ? reviewImageLines(ctx, entry.time, cw - 32) : [];
            return { name: name, time: time, color: reviewColor(plan, entry), height: 22 + name.length * 32 + time.length * 26 };
          });
        });
        var height = Math.max.apply(null, [84].concat(cells.map(function (cell) {
          return 12 + cell.reduce(function (sum, entry) { return sum + entry.height; }, 0);
        })));
        return { dayIdx: dayIdx, cells: cells, height: height };
      });
      var result = { group: section.group, columns: section.columns, headerLines: headerLines, headerHeight: headerHeight, rows: rows, y: y, columnWidth: cw, dayWidth: dayWidth, contentWidth: contentWidth };
      y += 64 + headerHeight + rows.reduce(function (sum, r) { return sum + r.height; }, 0) + 50;
      result.end = y;
      return result;
    });
  }

  var parts = layout(width);
  var height = parts[parts.length - 1].end + 70;
  /* ضمان صيغة أفقية حتى مع نصوص طويلة أو عدة مواد في خلية واحدة. */
  if (height >= width) { width = height + 180; parts = layout(width); height = parts[parts.length - 1].end + 70; }
  if (width > 8000 || height > 8000) throw new Error('الجدول كبير جداً لإنشاء صورة؛ قلّل عدد الأعمدة أو الحصص.');
  canvas.width = width; canvas.height = height;
  ctx.fillStyle = '#f7f6fc'; ctx.fillRect(0, 0, width, height);
  function text(value, x, y, font, color, direction) {
    ctx.font = font; ctx.fillStyle = color; ctx.direction = direction || 'rtl';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(value), x, y);
  }
  text('جدول المراجعة الأسبوعي', width / 2, 76, '800 54px Cairo, sans-serif', '#252443');
  text('الأيام على اليمين · الأوقات في الأعلى', width / 2, 134, '600 25px Cairo, sans-serif', '#706f87');

  parts.forEach(function (section) {
    var left = 80, right = width - 80, dayX = right - section.dayWidth;
    var y = section.y;
    ctx.fillStyle = '#634bcc'; ctx.fillRect(right - 8, y + 7, 8, 30);
    ctx.font = '800 32px Cairo, sans-serif'; ctx.fillStyle = '#302d4c';
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(section.group.title, right - 26, y + 25);
    y += 64;
    ctx.fillStyle = '#e9e6f6'; ctx.fillRect(left, y, section.contentWidth, section.headerHeight);
    text('اليوم', dayX + section.dayWidth / 2, y + section.headerHeight / 2, '800 26px Cairo, sans-serif', '#373454');
    if (!section.columns.length) text('لا توجد أوقات', (left + dayX) / 2, y + section.headerHeight / 2, '600 24px Cairo, sans-serif', '#706f87');
    section.columns.forEach(function (col, i) {
      var x = dayX - (i + 1) * section.columnWidth;
      var lines = section.headerLines[i], startY = y + (section.headerHeight - lines.length * 30) / 2 + 15;
      lines.forEach(function (line, j) { text(line, x + section.columnWidth / 2, startY + j * 30, '700 24px Cairo, sans-serif', '#57516e', /[\u0600-\u06ff]/.test(line) ? 'rtl' : 'ltr'); });
    });
    y += section.headerHeight;
    section.rows.forEach(function (row) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(left, y, section.contentWidth, row.height);
      ctx.fillStyle = '#f0eef9'; ctx.fillRect(dayX, y, section.dayWidth, row.height);
      text(REVIEW_DAYS[row.dayIdx], dayX + section.dayWidth / 2, y + row.height / 2, '800 26px Cairo, sans-serif', '#373454');
      row.cells.forEach(function (entries, i) {
        var x = dayX - (i + 1) * section.columnWidth;
        ctx.strokeStyle = '#e4e2ef'; ctx.lineWidth = 1; ctx.strokeRect(x, y, section.columnWidth, row.height);
        if (!entries.length) { text('—', x + section.columnWidth / 2, y + row.height / 2, '500 24px Cairo, sans-serif', '#cbc9d8', 'ltr'); return; }
        var cy = y + 6;
        entries.forEach(function (entry) {
          ctx.fillStyle = entry.color || '#eeeafb'; ctx.fillRect(x + 6, cy, section.columnWidth - 12, entry.height - 6);
          var ly = cy + 22;
          entry.name.forEach(function (line) { text(line, x + section.columnWidth / 2, ly, '700 25px Cairo, sans-serif', entry.color ? reviewTextColor(entry.color) : '#4e3c8e'); ly += 32; });
          entry.time.forEach(function (line) { text(line, x + section.columnWidth / 2, ly, '600 20px Cairo, sans-serif', entry.color ? reviewTextColor(entry.color) : '#826a2a', /[\u0600-\u06ff]/.test(line) ? 'rtl' : 'ltr'); ly += 26; });
          cy += entry.height;
        });
      });
      ctx.strokeStyle = '#e4e2ef'; ctx.strokeRect(dayX, y, section.dayWidth, row.height);
      y += row.height;
    });
  });
  text('آية باك 2027', width / 2, height - 45, '700 22px Cairo, sans-serif', '#8a879d');
  return canvas;
}

/* رفع اختياري إلى خدمة خارجية: الرابط عام ويبقى مدة مؤقتة حسب الخدمة. */
function uploadReviewImage(blob) {
  var form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('time', '24h');
  form.append('fileToUpload', blob, 'review-schedule.png');
  return fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST', body: form, credentials: 'omit'
  }).then(function (response) {
    if (!response.ok) throw new Error('تعذّر رفع الصورة. حاول مجدداً أو نزّلها مباشرة.');
    return response.text();
  }).then(function (value) {
    var url = value.trim();
    if (!/^https:\/\/litter\.catbox\.moe\/[a-zA-Z0-9._-]+$/.test(url)) throw new Error('لم تُرجع خدمة الرفع رابطاً صالحاً.');
    return url;
  });
}

function showReviewImage(plan, data) {
  if (document.querySelector('.review-image-overlay')) return;
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay review-image-overlay';
  overlay.innerHTML = '<div class="modal review-image-modal" role="dialog" aria-modal="true" aria-labelledby="reviewImageTitle">' +
    '<div class="review-image-head"><h2 id="reviewImageTitle">' + svgIcon('image') + ' صورة جدول المراجعة</h2>' +
    '<button type="button" class="icon-btn" data-image-close aria-label="إغلاق">' + svgIcon('x') + '</button></div>' +
    '<p class="hint">يمكنك الرفع إلى Litterbox للحصول على رابط عام مؤقت لمدة 24 ساعة؛ كل من يملك الرابط يستطيع رؤية الصورة. أو نزّلها مباشرة دون رفع.</p>' +
    '<div class="review-image-preview"><span class="review-image-loading">جارٍ تجهيز الصورة…</span></div>' +
    '<div class="review-image-actions"><button type="button" class="btn btn-primary" data-image-upload hidden>' + svgIcon('upload') + ' رفع الصورة للحصول على رابط</button><a class="btn" data-image-download hidden download="جدول-المراجعة.png">' + svgIcon('download') + ' تنزيل مباشر</a>' +
    '<button type="button" class="btn" data-image-close>إغلاق</button></div><div class="review-upload-result" role="status" aria-live="polite"></div></div>';
  document.body.appendChild(overlay);
  var previousFocus = document.activeElement;
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  $all('[data-image-close]', overlay).forEach(function (el) { el.addEventListener('click', close); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  overlay.querySelector('[data-image-close]').focus({ preventScroll: true });
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready.catch(function () {}) : Promise.resolve();
  Promise.race([ready, new Promise(function (resolve) { setTimeout(resolve, 2500); })]).then(function () {
    if (!overlay.isConnected) return;
    try {
      var canvas = buildReviewCanvas(plan, data);
      var src = canvas.toDataURL('image/png');
      if (src === 'data:,') throw new Error('تعذّر إنشاء الصورة بالحجم المطلوب.');
      var image = document.createElement('img');
      image.src = src;
      image.alt = 'صورة أفقية لجدول المراجعة الأسبوعي';
      var preview = overlay.querySelector('.review-image-preview');
      preview.textContent = '';
      preview.appendChild(image);
      var download = overlay.querySelector('[data-image-download]');
      download.href = src; download.hidden = false;
      var upload = overlay.querySelector('[data-image-upload]');
      var result = overlay.querySelector('.review-upload-result');
      upload.hidden = false;
      upload.addEventListener('click', function () {
        if (upload.disabled) return;
        upload.disabled = true; result.textContent = 'جارٍ رفع الصورة…';
        try { canvas.toBlob(function (blob) {
          if (!blob) { result.textContent = 'تعذّر تجهيز الصورة للرفع. استخدم التنزيل المباشر.'; upload.disabled = false; return; }
          uploadReviewImage(blob).then(function (url) {
            result.textContent = '';
            var message = document.createElement('p');
            message.textContent = 'تم الرفع. افتح الرابط لحفظ الصورة؛ الرابط عام وصالح لمدة 24 ساعة وفق خدمة Litterbox:';
            var link = document.createElement('a');
            link.href = url; link.textContent = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
            result.appendChild(message); result.appendChild(link);
          }).catch(function () { result.textContent = 'تعذّر الرفع. تحقق من الاتصال أو نزّل الصورة مباشرة.'; })
            .finally(function () { upload.disabled = false; });
        }, 'image/png'); } catch (e) { result.textContent = 'تعذّر تجهيز الصورة للرفع. استخدم التنزيل المباشر.'; upload.disabled = false; }
      });
    } catch (e) {
      overlay.querySelector('.review-image-preview').textContent = (e && e.message && /[\u0600-\u06ff]/.test(e.message)) ? e.message : 'تعذّر إنشاء صورة الجدول على هذا الجهاز. حاول مجدداً.';
    }
  });
}
