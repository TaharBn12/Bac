/* ============================================================
   آية باك 2027 — استعمال الزمن الدراسي الأسبوعي الذكي
   - إضافة وتعديل وتخصيص استعمال الزمن تتم حصرياً من لوحة التحكم (admin.html)
   - صفحة المستخدم (schedule.html) مخصّصة لعرض الجدول ومتابعة الدروس وتحديدها كمكتملة باللون الأخضر
   - يتجدد تلقائياً كل يوم سبت على الساعة 22:00 (10:00 ليلاً) مع استبعاد الدروس المكتملة
   ============================================================ */
'use strict';

var SCHED_PLAN_KEY     = 'ayaBacSchedulePlan.v1';
var SCHED_SETTINGS_KEY = 'ayaBacScheduleSettings.v1';

var WEEK_DAYS = [
  { idx: 0, key: 'sun', name: 'الأحد',     jsDay: 0 },
  { idx: 1, key: 'mon', name: 'الإثنين',   jsDay: 1 },
  { idx: 2, key: 'tue', name: 'الثلاثاء',  jsDay: 2 },
  { idx: 3, key: 'wed', name: 'الأربعاء',  jsDay: 3 },
  { idx: 4, key: 'thu', name: 'الخميس',    jsDay: 4 },
  { idx: 5, key: 'fri', name: 'الجمعة',    jsDay: 5 },
  { idx: 6, key: 'sat', name: 'السبت',     jsDay: 6 }
];

var DEFAULT_PERIODS = [
  { label: 'الفترة الصباحية', time: '08:30 - 10:30' },
  { label: 'فترة الظهيرة',    time: '14:00 - 16:00' },
  { label: 'الفترة المسائية', time: '19:30 - 21:30' },
  { label: 'فترة السهرة',     time: '21:45 - 23:00' },
  { label: 'حصة إضافية',      time: '16:30 - 18:00' }
];

function normalizeScheduleSettings(parsed) {
  var defaults = {
    sessionsPerDay: 3,
    lightDayIdx: 5,          /* الجمعة يوم مخفّف افتراضياً */
    includeExercises: true,  /* إدراج تمارين الوحدة ضمن تسلسل المراجعة */
    autoRenew: true,         /* التجديد التلقائي كل سبت على 10:00 ليلاً */
    periods: DEFAULT_PERIODS.map(function (p) { return { label: p.label, time: p.time }; })
  };
  if (!parsed || typeof parsed !== 'object') return defaults;
  var spd = Math.max(1, Math.min(5, parseInt(parsed.sessionsPerDay, 10) || 3));
  var light = typeof parsed.lightDayIdx === 'number' ? parsed.lightDayIdx : 5;
  var incEx = parsed.includeExercises !== false;
  var autoRen = parsed.autoRenew !== false;
  var periods = Array.isArray(parsed.periods) && parsed.periods.length >= 4
    ? parsed.periods.map(function (p, i) {
        var fb = DEFAULT_PERIODS[i] || DEFAULT_PERIODS[0];
        return { label: (p && p.label) || fb.label, time: (p && p.time) || fb.time };
      })
    : defaults.periods;
  while (periods.length < 5) {
    periods.push({ label: DEFAULT_PERIODS[periods.length].label, time: DEFAULT_PERIODS[periods.length].time });
  }
  return {
    sessionsPerDay: spd,
    lightDayIdx: light,
    includeExercises: incEx,
    autoRenew: autoRen,
    periods: periods
  };
}

function loadScheduleSettings() {
  if (window.CLOUD_SCHEDULE && window.CLOUD_SCHEDULE.settings) {
    return normalizeScheduleSettings(window.CLOUD_SCHEDULE.settings);
  }
  try {
    var raw = localStorage.getItem(SCHED_SETTINGS_KEY);
    if (raw) return normalizeScheduleSettings(JSON.parse(raw));
  } catch (e) { /* تجاهل */ }
  return normalizeScheduleSettings(null);
}

function loadSavedPlan() {
  if (window.CLOUD_SCHEDULE && window.CLOUD_SCHEDULE.plan && Array.isArray(window.CLOUD_SCHEDULE.plan.slots)) {
    return window.CLOUD_SCHEDULE.plan;
  }
  try {
    var raw = localStorage.getItem(SCHED_PLAN_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return (parsed && parsed.cycleKey && Array.isArray(parsed.slots)) ? parsed : null;
  } catch (e) {
    return null;
  }
}

/* حفظ الخطة والإعدادات (وعند الحفظ من الأدمن يتم رفعها فوراً إلى سحابة Supabase) */
function persistScheduleState(plan, settings, syncToCloud) {
  if (plan) {
    try { localStorage.setItem(SCHED_PLAN_KEY, JSON.stringify(plan)); } catch (e) { /* تجاهل */ }
    if (window.CLOUD_SCHEDULE) window.CLOUD_SCHEDULE.plan = plan;
  }
  if (settings) {
    try { localStorage.setItem(SCHED_SETTINGS_KEY, JSON.stringify(settings)); } catch (e2) { /* تجاهل */ }
    if (window.CLOUD_SCHEDULE) window.CLOUD_SCHEDULE.settings = settings;
  }
  if (syncToCloud && typeof Cloud !== 'undefined' && Cloud && Cloud.mode === 'cloud' && typeof Cloud.saveSchedule === 'function') {
    return Cloud.saveSchedule(plan, settings);
  }
  return Promise.resolve(true);
}

/* بناء التسلسل الكامل المرتب لعناصر المادة (الوحدة 1: دروسها بالترتيب ثم تمارينها، تليها الوحدة 2...) */
function buildSubjectSequence(data, subject, includeExercises) {
  var seq = [];
  /* نستخدم includeHidden=false دائماً في استعمال الزمن لئلا تدرج عناصر مخفية عن الطلاب */
  var units = (data.units || []).filter(function (u) {
    return u.subjectId === subject.id && !u.hidden;
  }).sort(byOrder);
  var lessonSeqNum = 0;
  var exSeqNum = 0;

  units.forEach(function (u, uIdx) {
    var ls = (data.lessons || []).filter(function (l) {
      return l.unitId === u.id && !isExerciseItem(l) && !l.hidden;
    }).sort(byOrder);
    ls.forEach(function (l, lIdx) {
      lessonSeqNum++;
      seq.push({
        itemId: l.id,
        itemType: 'lesson',
        title: l.title,
        unitId: u.id,
        unitTitle: u.title,
        unitNum: uIdx + 1,
        orderInUnit: lIdx + 1,
        seqNum: lessonSeqNum,
        completed: isItemCompleted(l.id)
      });
    });

    if (includeExercises) {
      var exs = (data.lessons || []).filter(function (l) {
        return l.unitId === u.id && isExerciseItem(l) && !l.hidden;
      }).sort(byOrder);
      exs.forEach(function (ex, eIdx) {
        exSeqNum++;
        seq.push({
          itemId: ex.id,
          itemType: 'exercise',
          title: ex.title,
          unitId: u.id,
          unitTitle: u.title,
          unitNum: uIdx + 1,
          orderInUnit: eIdx + 1,
          seqNum: exSeqNum,
          completed: isItemCompleted(ex.id)
        });
      });
    }
  });

  return seq;
}

function nonHiddenSubjectsOf(data) {
  return (data.subjects || []).filter(function (s) { return !s.hidden; }).sort(byOrder);
}

function buildDayCapacities(settings) {
  return WEEK_DAYS.map(function (d) {
    if (settings.lightDayIdx === d.idx) {
      return Math.max(1, settings.sessionsPerDay - 1);
    }
    return settings.sessionsPerDay;
  });
}

/* توزيع الحصص الأسبوعية بين المواد تناسبياً مع معامل كل مادة (طريقة Hamilton للبواقي الكبرى) */
function allocateQuotasByCoefficient(subjects, totalSlots) {
  if (!subjects.length || totalSlots <= 0) return {};
  var sumCoeff = subjects.reduce(function (s, sub) { return s + getSubjectCoefficient(sub); }, 0);
  if (sumCoeff <= 0) sumCoeff = subjects.length;

  var quotas = {};
  var remainders = [];
  var assigned = 0;

  subjects.forEach(function (sub, idx) {
    var coeff = getSubjectCoefficient(sub);
    var exact = (coeff / sumCoeff) * totalSlots;
    var base = Math.floor(exact);
    if (totalSlots >= subjects.length && base === 0) base = 1;
    quotas[sub.id] = base;
    assigned += base;
    remainders.push({ id: sub.id, rem: exact - Math.floor(exact), coeff: coeff, idx: idx });
  });

  while (assigned > totalSlots) {
    remainders.sort(function (a, b) { return a.coeff - b.coeff || a.rem - b.rem; });
    for (var i = 0; i < remainders.length && assigned > totalSlots; i++) {
      if (quotas[remainders[i].id] > 0) {
        quotas[remainders[i].id]--;
        assigned--;
      }
    }
  }

  remainders.sort(function (a, b) {
    return (b.rem - a.rem) || (b.coeff - a.coeff) || (a.idx - b.idx);
  });
  var rCursor = 0;
  while (assigned < totalSlots && remainders.length) {
    var pick = remainders[rCursor % remainders.length];
    quotas[pick.id] = (quotas[pick.id] || 0) + 1;
    assigned++;
    rCursor++;
  }

  return quotas;
}

/* توليد جدول الأسبوع تلقائياً لدورة السبت 22:00 الحالية (بمعرّفات حتمية متطابقة بين كل الأجهزة واستبعاد ما أُكمل سابقاً) */
function generateWeeklySchedulePlan(data, cycleInfo, settings) {
  var subjects = nonHiddenSubjectsOf(data);
  var dayCaps = buildDayCapacities(settings);
  var totalSlots = dayCaps.reduce(function (a, b) { return a + b; }, 0);
  var quotas = allocateQuotasByCoefficient(subjects, totalSlots);

  var bundlesBySubj = {};
  subjects.forEach(function (sub) {
    var q = quotas[sub.id] || 0;
    if (!q) return;
    var fullSeq = buildSubjectSequence(data, sub, settings.includeExercises);
    var pendingSeq = fullSeq.filter(function (item) { return !item.completed; });
    var subjSlots = [];

    for (var k = 0; k < q; k++) {
      if (k < pendingSeq.length) {
        var target = pendingSeq[k];
        subjSlots.push({
          subjectId: sub.id,
          itemId: target.itemId,
          itemType: target.itemType,
          unitId: target.unitId,
          unitTitle: target.unitTitle,
          seqOrder: k + 1,
          curriculumNum: target.seqNum,
          customTitle: '',
          note: target.itemType === 'exercise' ? 'حل التمرين بتأنٍ ومقارنة الحل النموذجي' : 'فهم الدرس وتلخيص أهم القوانين والأفكار',
          sessionKind: target.itemType === 'exercise' ? 'exercise' : 'lesson'
        });
      } else if (pendingSeq.length > 0) {
        var reinforceTarget = pendingSeq[k % pendingSeq.length];
        subjSlots.push({
          subjectId: sub.id,
          itemId: reinforceTarget.itemId,
          itemType: reinforceTarget.itemType,
          unitId: reinforceTarget.unitId,
          unitTitle: reinforceTarget.unitTitle,
          seqOrder: k + 1,
          curriculumNum: reinforceTarget.seqNum,
          customTitle: 'تثبيت وتطبيقات: ' + reinforceTarget.title,
          note: 'حصة إضافية بحكم المعامل المرتفع (' + getSubjectCoefficient(sub) + ') لترسيخ الدرس وحل تمارينه',
          sessionKind: 'reinforce'
        });
      } else if (fullSeq.length > 0) {
        subjSlots.push({
          subjectId: sub.id,
          itemId: '',
          itemType: 'review',
          unitId: '',
          unitTitle: 'كل الدروس المضافة مكتملة ✓',
          seqOrder: k + 1,
          curriculumNum: 0,
          customTitle: 'مراجعة شاملة وحل مواضيع في ' + sub.name,
          note: 'أحسنتِ! أنهيتِ جميع الدروس المضافة حالياً في هذه المادة',
          sessionKind: 'review'
        });
      } else {
        subjSlots.push({
          subjectId: sub.id,
          itemId: '',
          itemType: 'review',
          unitId: '',
          unitTitle: 'مراجعة حرة',
          seqOrder: k + 1,
          curriculumNum: 0,
          customTitle: 'مراجعة أساسيات ' + sub.name,
          note: 'في انتظار إضافة وحدات ودروس جديدة في هذه المادة',
          sessionKind: 'review'
        });
      }
    }

    bundlesBySubj[sub.id] = subjSlots;
  });

  var dayBuckets = WEEK_DAYS.map(function () { return []; });
  var sortedSubjs = subjects.slice().sort(function (a, b) {
    return getSubjectCoefficient(b) - getSubjectCoefficient(a);
  });

  var dayCursor = 0;
  sortedSubjs.forEach(function (sub) {
    var list = bundlesBySubj[sub.id] || [];
    list.forEach(function (slotItem) {
      var bestDay = -1;
      var bestSameSubjCount = 999;
      var bestFillRatio = 999;

      for (var step = 0; step < 7; step++) {
        var dIdx = (dayCursor + step) % 7;
        if (dayBuckets[dIdx].length >= dayCaps[dIdx]) continue;
        var sameCount = dayBuckets[dIdx].filter(function (x) { return x.subjectId === sub.id; }).length;
        var fillRatio = dayBuckets[dIdx].length / dayCaps[dIdx];
        if (sameCount < bestSameSubjCount || (sameCount === bestSameSubjCount && fillRatio < bestFillRatio)) {
          bestDay = dIdx;
          bestSameSubjCount = sameCount;
          bestFillRatio = fillRatio;
        }
      }

      if (bestDay === -1) bestDay = dayCursor % 7;
      dayBuckets[bestDay].push(slotItem);
      dayCursor = (bestDay + 1) % 7;
    });
  });

  var finalSlots = [];
  dayBuckets.forEach(function (bucket, dIdx) {
    bucket.forEach(function (s, pIdx) {
      var per = settings.periods[pIdx] || DEFAULT_PERIODS[pIdx % DEFAULT_PERIODS.length];
      finalSlots.push({
        id: 'sl-' + cycleInfo.cycleKey + '-' + dIdx + '-' + pIdx,
        dayIdx: dIdx,
        periodIdx: pIdx,
        periodLabel: per.label,
        timeLabel: per.time,
        subjectId: s.subjectId,
        itemId: s.itemId || '',
        itemType: s.itemType || 'lesson',
        unitId: s.unitId || '',
        unitTitle: s.unitTitle || '',
        seqOrder: s.seqOrder || (pIdx + 1),
        curriculumNum: s.curriculumNum || 0,
        customTitle: s.customTitle || '',
        note: s.note || '',
        sessionKind: s.sessionKind || 'lesson',
        isManual: false
      });
    });
  });

  return {
    cycleKey: cycleInfo.cycleKey,
    generatedAt: new Date().toISOString(),
    quotas: quotas,
    slots: finalSlots
  };
}

function fmtArabicShortDate(dt) {
  try {
    return dt.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'long' });
  } catch (e) {
    return dt.getDate() + '/' + (dt.getMonth() + 1);
  }
}

function slotCompletionKey(slot) {
  if (!slot) return '';
  return slot.itemId ? slot.itemId : ('slot:' + slot.id);
}

/* ============================================================
   مكوّن مشترك لعرض وإدارة استعمال الزمن:
   - adminMode = false (في schedule.html): عرض الجدول للطالبة + زر الإكمال باللون الأخضر + الطباعة فقط (دون أي أزرار إضافة/تعديل ودون طيّ)
   - adminMode = true  (في admin.html): تحكّم كامل من الأدمن (إضافة حصص، تعديل، نقل، حذف، إعدادات، توليد تلقائي، وطيّ البطاقات بزر السهم)
   ============================================================ */
function mountScheduleWorkspace(rootEl, opts) {
  opts = opts || {};
  var isAdmin = !!opts.adminMode;
  var data = opts.data || loadData();

  if (window._ayaActiveSchedTimer) {
    clearInterval(window._ayaActiveSchedTimer);
    window._ayaActiveSchedTimer = null;
  }

  var settings = loadScheduleSettings();
  var cycle = getStudyCycleInfo();
  var plan = loadSavedPlan();

  /* منطق التجديد الأسبوعي كل سبت على 10:00 ليلاً:
     - إذا وُجدت خطة سابقة معتمدة وحانت دورة السبت 10:00 ليلاً الجديدة مع تفعيل autoRenew -> تتجدد الخطة باستبعاد الدروس المكتملة.
     - إذا لم يُنشئ الأدمن أي جدول بعد: في لوحة الأدمن يظهر زر الإنشاء/الإضافة الفوري، وفي صفحة المستخدم تظهر رسالة انتظار إضافة الجدول من الإدارة. */
  if (plan && plan.cycleKey !== cycle.cycleKey && settings.autoRenew !== false && plan.slots && plan.slots.length > 0) {
    plan = generateWeeklySchedulePlan(data, cycle, settings);
    persistScheduleState(plan, settings, isAdmin);
    setTimeout(function () {
      toast('تجدّد استعمال الزمن الأسبوعي تلقائياً (دورة السبت 10:00 ليلاً) مع استبعاد الدروس المكتملة!');
    }, 250);
  }

  if (!plan) {
    plan = { cycleKey: cycle.cycleKey, generatedAt: null, quotas: {}, slots: [] };
  }

  var activeView = 'days'; /* 'days' | 'subjects' */
  var adminOpenSubjCards = {}; /* الطيّ بزر السهم في موقع الأدمن فقط */

  rootEl.innerHTML =
    '<section class="sched-hero" id="schedHero">' +
      '<div class="sched-hero-main">' +
        '<div class="sched-kicker">' +
          svgIcon(isAdmin ? 'gear' : 'sparkles') +
          '<span>' + (isAdmin ? 'إدارة وبناء استعمال الزمن الأسبوعي (للأدمن فقط — يتزامن سحابياً مع موقع الطالبة)' : 'خطة دراسية أسبوعية مبنية على معامل كل مادة وتسلسل الدروس') + '</span>' +
        '</div>' +
        '<h1>' + (isAdmin ? 'إضافة وإدارة استعمال الزمن الدراسي' : 'استعمال الزمن الدراسي الأسبوعي') + '</h1>' +
        '<p id="schedCycleDates"></p>' +
        '<div class="sched-stats-row" id="schedStatsRow"></div>' +
      '</div>' +
      '<div class="sched-renewal-box">' +
        '<div class="srb-head">' +
          svgIcon('clock') +
          '<span>التجديد التلقائي القادم (السبت 10:00 ليلاً)</span>' +
        '</div>' +
        '<div class="srb-countdown" id="schedCountdown" dir="ltr">' +
          '<div class="cd-cell"><b id="cdDays">00</b><small>يوم</small></div>' +
          '<span class="cd-sep">:</span>' +
          '<div class="cd-cell"><b id="cdHours">00</b><small>ساعة</small></div>' +
          '<span class="cd-sep">:</span>' +
          '<div class="cd-cell"><b id="cdMins">00</b><small>دقيقة</small></div>' +
          '<span class="cd-sep">:</span>' +
          '<div class="cd-cell"><b id="cdSecs">00</b><small>ثانية</small></div>' +
        '</div>' +
        '<div class="srb-note">' +
          (settings.autoRenew !== false
            ? 'الدروس المكتملة تبقى باللون الأخضر هذا الأسبوع ولن توضع في جدول الأسبوع القادم'
            : 'التجديد التلقائي متوقف حالياً من إعدادات الإدارة (جدول ثابت)') +
        '</div>' +
      '</div>' +
    '</section>' +

    '<div class="sched-toolbar">' +
      '<div class="sched-view-tabs" role="tablist" aria-label="طريقة عرض استعمال الزمن">' +
        '<button type="button" class="sched-vtab active" data-sview="days">' +
          svgIcon('calendar') + ' <span>الجدول اليومي (الأحد ← السبت)</span>' +
        '</button>' +
        '<button type="button" class="sched-vtab" data-sview="subjects">' +
          svgIcon('book') + ' <span>تفصيل المواد وما يجب قراءته بالترتيب</span>' +
        '</button>' +
      '</div>' +
      '<div class="sched-actions">' +
        (isAdmin
          ? '<button type="button" class="btn btn-primary btn-sm" id="addManualSlotBtn">' +
              svgIcon('plus') + ' إضافة حصة دراسية' +
            '</button>' +
            '<button type="button" class="btn btn-sm" id="regenSchedBtn" title="توليد أو تحديث استعمال الزمن تلقائياً حسب معامل كل مادة واستبعاد المكتمل">' +
              svgIcon('wand') + ' توليد حسب المعاملات' +
            '</button>' +
            '<button type="button" class="btn btn-sm" id="openSchedSettingsBtn">' +
              svgIcon('sliders') + ' إعدادات التوزيع والأوقات' +
            '</button>' +
            '<button type="button" class="btn btn-sm" id="clearSchedBtn" title="تفريغ كل الحصص لبناء جدول يدوي من الصفر">' +
              svgIcon('trash') + ' تفريغ الجدول' +
            '</button>' +
            '<a class="btn btn-sm" href="schedule.html" target="_blank">' +
              svgIcon('eye') + ' معاينة صفحة الطالبة' +
            '</a>'
          : '<button type="button" class="btn btn-sm" id="printSchedBtn" title="طباعة استعمال الزمن">' +
              svgIcon('printer') + ' طباعة الجدول' +
            '</button>') +
      '</div>' +
    '</div>' +

    '<div class="sched-coeff-strip" id="schedCoeffStrip"></div>' +
    '<div id="schedMainMount"></div>';

  function resolveSlotDetails(slot) {
    var subj = data.subjects.find(function (s) { return s.id === slot.subjectId; }) ||
      { id: slot.subjectId, name: 'مادة دراسية', icon: 'book', color: 'indigo', coefficient: 2 };
    var itemObj = slot.itemId ? data.lessons.find(function (l) { return l.id === slot.itemId; }) : null;
    var unitObj = (itemObj && data.units.find(function (u) { return u.id === itemObj.unitId; })) ||
      (slot.unitId ? data.units.find(function (u) { return u.id === slot.unitId; }) : null);

    var displayTitle = slot.customTitle || (itemObj ? itemObj.title : 'حصة مراجعة');
    var unitTitle = unitObj ? unitObj.title : (slot.unitTitle || '');
    var cKey = slotCompletionKey(slot);
    var completed = cKey ? isItemCompleted(cKey) : !!slot.manualDone;
    var isEx = itemObj ? isExerciseItem(itemObj) : (slot.itemType === 'exercise');

    return {
      subj: subj,
      coeff: getSubjectCoefficient(subj),
      item: itemObj,
      unit: unitObj,
      displayTitle: displayTitle,
      unitTitle: unitTitle,
      completed: completed,
      isEx: isEx
    };
  }

  function renderTopSummary() {
    cycle = getStudyCycleInfo();
    var datesEl = $('#schedCycleDates', rootEl);
    if (datesEl) {
      datesEl.innerHTML =
        svgIcon('calendar') + ' أسبوع المراجعة من <b>الأحد ' + fmtArabicShortDate(cycle.sundayStart) +
        '</b> إلى <b>السبت ' + fmtArabicShortDate(cycle.saturdayEnd) + '</b> — يتجدد كل سبت على <b>10:00 ليلاً</b>';
    }

    var totalWeekSlots = plan.slots.length;
    var doneWeekSlots = plan.slots.filter(function (sl) { return resolveSlotDetails(sl).completed; }).length;
    var pct = totalWeekSlots ? Math.round((doneWeekSlots / totalWeekSlots) * 100) : 0;

    var allSubjects = nonHiddenSubjectsOf(data);
    var totalCurr = 0, doneCurr = 0;
    allSubjects.forEach(function (s) {
      var seq = buildSubjectSequence(data, s, true);
      totalCurr += seq.length;
      seq.forEach(function (it) { if (it.completed) doneCurr++; });
    });

    var statsEl = $('#schedStatsRow', rootEl);
    if (statsEl) {
      statsEl.innerHTML =
        '<div class="sched-stat-pill">' +
          svgIcon('layers') +
          '<div><b>' + totalWeekSlots + ' حصة هذا الأسبوع</b><small>موزعة على ' + allSubjects.length + ' مواد حسب المعامل</small></div>' +
        '</div>' +
        '<div class="sched-stat-pill done-stat">' +
          svgIcon('check-circle') +
          '<div><b>' + doneWeekSlots + ' / ' + totalWeekSlots + ' مكتمل بالأخضر (' + pct + '%)</b><small>في جدول هذا الأسبوع</small></div>' +
        '</div>' +
        '<div class="sched-stat-pill">' +
          svgIcon('award') +
          '<div><b>' + doneCurr + ' / ' + totalCurr + ' إجمالي المنهج المكتمل</b><small>يُستبعد تلقائياً في الأسبوع المقبل</small></div>' +
        '</div>';
    }

    var stripEl = $('#schedCoeffStrip', rootEl);
    if (stripEl) {
      var sortedByCoeff = allSubjects.slice().sort(function (a, b) {
        return getSubjectCoefficient(b) - getSubjectCoefficient(a);
      });
      stripEl.innerHTML = sortedByCoeff.map(function (s) {
        var c = getSubjectCoefficient(s);
        var countInPlan = plan.slots.filter(function (sl) { return sl.subjectId === s.id; }).length;
        return '<div class="coeff-chip c-' + (s.color || 'indigo') + '">' +
          '<span class="cc-ico">' + iconHTML(s.icon, 'book') + '</span>' +
          '<span class="cc-name">' + escapeHtml(s.name) + '</span>' +
          '<span class="cc-val">معامل ' + c + '</span>' +
          '<span class="cc-slots">' + countInPlan + ' ' + (countInPlan === 1 ? 'حصة' : 'حصص') + '</span>' +
        '</div>';
      }).join('');
    }
  }

  function tickCountdown() {
    var nowCycle = getStudyCycleInfo();
    if (nowCycle.cycleKey !== plan.cycleKey && settings.autoRenew !== false && plan.slots.length > 0) {
      plan = generateWeeklySchedulePlan(data, nowCycle, settings);
      persistScheduleState(plan, settings, isAdmin);
      renderAll();
      toast('حان موعد السبت 10:00 ليلاً — تم تجديد استعمال الزمن للأسبوع الجديد تلقائياً!');
      return;
    }
    var r = nowCycle.remaining;
    var elD = $('#cdDays', rootEl), elH = $('#cdHours', rootEl), elM = $('#cdMins', rootEl), elS = $('#cdSecs', rootEl);
    if (elD) elD.textContent = String(r.days).padStart(2, '0');
    if (elH) elH.textContent = String(r.hours).padStart(2, '0');
    if (elM) elM.textContent = String(r.minutes).padStart(2, '0');
    if (elS) elS.textContent = String(r.seconds).padStart(2, '0');
  }

  /* 1) العرض اليومي (الأحد ← السبت) */
  function renderDaysView(mount) {
    if (!plan.slots.length) {
      mount.innerHTML = isAdmin
        ? '<div class="empty" style="padding:34px 20px">' +
            '<p style="margin:0 0 14px;font-weight:800;font-size:1.05rem">لا توجد حصص مضافة في استعمال الزمن حالياً</p>' +
            '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
              '<button type="button" class="btn btn-primary" data-sact="quick-generate">' + svgIcon('wand') + ' توليد الجدول تلقائياً حسب معاملات المواد</button>' +
              '<button type="button" class="btn" data-sact="add-to-day" data-day="0">' + svgIcon('plus') + ' إضافة أول حصة يدوياً</button>' +
            '</div>' +
          '</div>'
        : '<div class="empty" style="padding:32px 20px">لم تقم الإدارة بإضافة حصص استعمال الزمن لهذا الأسبوع بعد</div>';
      return;
    }

    var todayJsDay = new Date().getDay();

    mount.innerHTML = '<div class="sched-days-grid">' + WEEK_DAYS.map(function (day) {
      var dayDate = new Date(cycle.sundayStart.getTime());
      dayDate.setDate(dayDate.getDate() + day.idx);
      var isToday = (day.jsDay === todayJsDay);

      var daySlots = plan.slots
        .filter(function (sl) { return sl.dayIdx === day.idx; })
        .sort(function (a, b) { return (a.periodIdx || 0) - (b.periodIdx || 0); });

      var dayDoneCount = daySlots.filter(function (sl) { return resolveSlotDetails(sl).completed; }).length;

      return '<section class="sched-day-card' + (isToday ? ' is-today' : '') + '">' +
        '<header class="sched-day-head">' +
          '<div class="sdh-title">' +
            '<h2>' + day.name + (isToday ? ' <span class="today-pill">اليوم</span>' : '') + '</h2>' +
            '<small>' + fmtArabicShortDate(dayDate) + ' · ' + daySlots.length + ' حصص' +
              (dayDoneCount ? ' · <b class="txt-done">' + dayDoneCount + ' مكتمل ✓</b>' : '') +
            '</small>' +
          '</div>' +
          (isAdmin
            ? '<button type="button" class="btn btn-sm" data-sact="add-to-day" data-day="' + day.idx + '">' +
                svgIcon('plus') + ' حصة لهذا اليوم' +
              '</button>'
            : '') +
        '</header>' +
        '<div class="sched-slots-list">' +
          (daySlots.length ? daySlots.map(function (sl, sIdx) {
            var det = resolveSlotDetails(sl);
            var colorCls = 'c-' + (det.subj.color || 'indigo');
            var typeTag = det.isEx ? 'تمرين' : (sl.sessionKind === 'reinforce' ? 'تثبيت وتطبيق' : (sl.sessionKind === 'review' ? 'مراجعة' : 'درس'));
            var orderBadge = det.curriculumNum
              ? (det.isEx ? 'التمرين #' + det.curriculumNum : 'الدرس #' + det.curriculumNum + ' في الترتيب')
              : ('الحصة #' + (sl.seqOrder || (sIdx + 1)));

            return '<article class="sched-slot ' + colorCls + (det.completed ? ' is-slot-completed' : '') + '" data-slot-id="' + sl.id + '">' +
              '<div class="slot-time-col">' +
                '<span class="slot-period">' + escapeHtml(sl.periodLabel || ('الحصة ' + (sIdx + 1))) + '</span>' +
                '<span class="slot-clock" dir="ltr">' + escapeHtml(sl.timeLabel || '') + '</span>' +
                (isAdmin && sl.isManual ? '<span class="manual-tag">يدوي</span>' : '') +
              '</div>' +

              '<div class="slot-main-col">' +
                '<div class="slot-subj-row">' +
                  '<span class="slot-subj-badge">' + iconHTML(det.subj.icon, 'book') + ' ' + escapeHtml(det.subj.name) + '</span>' +
                  '<span class="slot-coeff-tag">معامل ' + det.coeff + '</span>' +
                  '<span class="slot-seq-tag">' + escapeHtml(typeTag + ' · ' + orderBadge) + '</span>' +
                  (det.completed ? '<span class="slot-green-pill">' + svgIcon('check-circle') + ' مكتمل ✓</span>' : '') +
                '</div>' +
                (det.unitTitle ? '<div class="slot-unit-lbl">' + svgIcon('layers') + ' ' + escapeHtml(det.unitTitle) + '</div>' : '') +
                '<div class="slot-lesson-title">' +
                  (det.item
                    ? '<a href="lesson.html?lesson=' + encodeURIComponent(det.item.id) + '"' + (isAdmin ? ' target="_blank"' : '') + '>' + escapeHtml(det.displayTitle) + '</a>'
                    : escapeHtml(det.displayTitle)) +
                '</div>' +
                (sl.note ? '<div class="slot-note">' + escapeHtml(sl.note) + '</div>' : '') +
              '</div>' +

              '<div class="slot-acts-col">' +
                '<button type="button" class="btn-slot-complete' + (det.completed ? ' done' : '') + '" data-sact="toggle-done" data-id="' + sl.id + '" title="' + (det.completed ? 'مكتمل — اضغط للتراجع' : 'تحديد كمكتمل (يتحول للأخضر ولن يوضع الأسبوع المقبل)') + '">' +
                  svgIcon(det.completed ? 'check-circle' : 'check') +
                  '<span>' + (det.completed ? 'مكتمل ✓' : 'إكمال') + '</span>' +
                '</button>' +
                (det.item
                  ? '<a class="btn btn-sm slot-open-btn" href="lesson.html?lesson=' + encodeURIComponent(det.item.id) + '"' + (isAdmin ? ' target="_blank"' : '') + ' title="فتح صفحة الدرس أو التمرين">' +
                      svgIcon('eye') + '<span>فتح</span>' +
                    '</a>'
                  : '') +
                (isAdmin
                  ? '<div class="slot-mini-tools">' +
                      '<button type="button" class="mini-ic-btn" data-sact="move-up" data-id="' + sl.id + '" title="تقديم الفترة"' + (sIdx === 0 ? ' disabled' : '') + '>' + svgIcon('chevron-up') + '</button>' +
                      '<button type="button" class="mini-ic-btn" data-sact="move-down" data-id="' + sl.id + '" title="تأخير الفترة"' + (sIdx === daySlots.length - 1 ? ' disabled' : '') + '>' + svgIcon('chevron-down') + '</button>' +
                      '<button type="button" class="mini-ic-btn" data-sact="edit-slot" data-id="' + sl.id + '" title="تعديل الحصة">' + svgIcon('pencil') + '</button>' +
                      '<button type="button" class="mini-ic-btn danger" data-sact="del-slot" data-id="' + sl.id + '" title="حذف الحصة من الجدول">' + svgIcon('trash') + '</button>' +
                    '</div>'
                  : '') +
              '</div>' +
            '</article>';
          }).join('') : '<div class="empty" style="padding:18px">' + (isAdmin ? 'لا توجد حصص في هذا اليوم — اضغط «+ حصة لهذا اليوم» للإضافة' : 'يوم راحة ومراجعة خفيفة') + '</div>') +
        '</div>' +
      '</section>';
    }).join('') + '</div>';
  }

  /* 2) عرض تفصيل كل مادة وما يجب قراءته بالترتيب المنهجي
        - في موقع الأدمن (isAdmin = true): المادة الأولى مفتوحة والبقية قابلة للطي بزر السهم
        - في موقع المستخدم (isAdmin = false): جميع المواد معروضة مفتوحة مباشرة دون طيّ */
  function renderSubjectsBreakdownView(mount) {
    var subjects = nonHiddenSubjectsOf(data).slice().sort(function (a, b) {
      return getSubjectCoefficient(b) - getSubjectCoefficient(a);
    });

    if (isAdmin && subjects.length && Object.keys(adminOpenSubjCards).length === 0) {
      adminOpenSubjCards[subjects[0].id] = true;
    }

    mount.innerHTML =
      (isAdmin
        ? '<div class="sec-subtools-bar" style="margin-bottom:12px">' +
            '<span class="hint" style="margin:0">المادة الأولى مفتوحة افتراضياً والبقية قابلة للطي بزر السهم:</span>' +
            '<button type="button" class="btn btn-sm" id="toggleAllSubjPlanBtn">' + svgIcon('chevron-down') + ' فتح / طي كل المواد</button>' +
          '</div>'
        : '') +
      '<div class="sched-subjects-stack">' +
      subjects.map(function (sub) {
        var coeff = getSubjectCoefficient(sub);
        var subjSlots = plan.slots.filter(function (sl) { return sl.subjectId === sub.id; });
        var fullSeq = buildSubjectSequence(data, sub, settings.includeExercises);
        var doneInSubj = fullSeq.filter(function (it) { return it.completed; }).length;
        var isOpen = isAdmin ? !!adminOpenSubjCards[sub.id] : true;

        var scheduledIds = {};
        subjSlots.forEach(function (sl) { if (sl.itemId) scheduledIds[sl.itemId] = true; });
        var nextWeekQueue = fullSeq.filter(function (it) { return !it.completed && !scheduledIds[it.itemId]; }).slice(0, 4);

        return '<section class="sched-subj-plan-card c-' + (sub.color || 'indigo') + (isOpen ? ' is-open' : ' is-collapsed') + '" data-sub-plan="' + sub.id + '">' +
          '<div class="sspc-head"' + (isAdmin ? ' data-sact="toggle-subj-card" data-sub="' + sub.id + '" role="button" tabindex="0"' : ' style="cursor:default"') + '>' +
            '<div class="sspc-title">' +
              '<div class="sspc-ico">' + iconHTML(sub.icon, 'book') + '</div>' +
              '<div>' +
                '<h3>' + escapeHtml(sub.name) + ' <span class="subj-coeff-badge">المعامل ' + coeff + '</span></h3>' +
                '<small>' + subjSlots.length + ' حصص مبرمجة هذا الأسبوع · أُنجز من المنهج ' + doneInSubj + ' من ' + fullSeq.length + '</small>' +
              '</div>' +
            '</div>' +
            (isAdmin
              ? '<button type="button" class="btn-acc-arrow' + (isOpen ? ' open' : '') + '">' +
                  '<span>' + (isOpen ? 'إخفاء التفصيل' : 'إظهار ما يجب قراءته') + '</span>' + svgIcon('chevron-down') +
                '</button>'
              : '') +
          '</div>' +

          '<div class="sspc-body"' + (isOpen ? '' : ' hidden') + '>' +
            '<h4 class="sspc-subhead">' + svgIcon('calendar') + ' المطلوب قراءته ومراجعته هذا الأسبوع بالترتيب:</h4>' +
            (subjSlots.length
              ? '<div class="sspc-Ordered-list">' + subjSlots.map(function (sl, idx) {
                  var det = resolveSlotDetails(sl);
                  var dayName = (WEEK_DAYS[sl.dayIdx] || WEEK_DAYS[0]).name;
                  return '<div class="sspc-step' + (det.completed ? ' is-slot-completed' : '') + '">' +
                    '<span class="sspc-step-num">' + (det.completed ? svgIcon('check') : (idx + 1)) + '</span>' +
                    '<div class="sspc-step-info">' +
                      '<div class="sspc-step-top">' +
                        '<span class="badge on">' + escapeHtml(dayName + ' · ' + (sl.periodLabel || '')) + '</span>' +
                        (det.unitTitle ? '<span class="sspc-unit">' + escapeHtml(det.unitTitle) + '</span>' : '') +
                        (det.completed ? '<span class="slot-green-pill">' + svgIcon('check-circle') + ' مكتمل ✓</span>' : '') +
                      '</div>' +
                      '<div class="sspc-step-title">' +
                        (det.item
                          ? '<a href="lesson.html?lesson=' + encodeURIComponent(det.item.id) + '"' + (isAdmin ? ' target="_blank"' : '') + '>' + escapeHtml(det.displayTitle) + '</a>'
                          : escapeHtml(det.displayTitle)) +
                      '</div>' +
                    '</div>' +
                    '<div class="sspc-step-acts">' +
                      '<button type="button" class="btn-slot-complete' + (det.completed ? ' done' : '') + '" data-sact="toggle-done" data-id="' + sl.id + '">' +
                        svgIcon(det.completed ? 'check-circle' : 'check') + '<span>' + (det.completed ? 'مكتمل ✓' : 'إكمال') + '</span>' +
                      '</button>' +
                    '</div>' +
                  '</div>';
                }).join('') + '</div>'
              : '<div class="empty" style="padding:12px">لا توجد حصص مضافة لهذه المادة هذا الأسبوع</div>') +

            (nextWeekQueue.length
              ? '<div class="sspc-next-queue">' +
                  '<strong>' + svgIcon('clock') + ' الدروس التالية في الترتيب (تُدرج في الأسبوع المقبل بعد إكمال الحالية):</strong>' +
                  '<div class="sspc-next-chips">' +
                    nextWeekQueue.map(function (nq) {
                      return '<a class="sspc-next-chip" href="lesson.html?lesson=' + encodeURIComponent(nq.itemId) + '"' + (isAdmin ? ' target="_blank"' : '') + '>' +
                        '#' + nq.seqNum + ' ' + escapeHtml(nq.title) + ' <small>(' + escapeHtml(nq.unitTitle) + ')</small>' +
                      '</a>';
                    }).join('') +
                  '</div>' +
                '</div>'
              : '') +
          '</div>' +
        '</section>';
      }).join('') +
      '</div>';

    if (isAdmin) {
      var toggleAllBtn = $('#toggleAllSubjPlanBtn', mount);
      if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', function () {
          var anyClosed = subjects.some(function (s) { return !adminOpenSubjCards[s.id]; });
          subjects.forEach(function (s, idx) {
            adminOpenSubjCards[s.id] = anyClosed ? true : (idx === 0);
          });
          renderSubjectsBreakdownView(mount);
        });
      }
    }
  }

  function renderAll() {
    renderTopSummary();
    var mount = $('#schedMainMount', rootEl);
    if (!mount) return;
    if (activeView === 'days') renderDaysView(mount);
    else renderSubjectsBreakdownView(mount);
  }

  /* نوافذ الإضافة والتعديل والإعدادات متاحة حصرياً للأدمن (isAdmin === true) */
  function openSlotEditorModal(existingSlot, defaultDayIdx) {
    if (!isAdmin) return;
    var old = document.querySelector('.modal-overlay');
    if (old) old.remove();

    var subjects = nonHiddenSubjectsOf(data);
    if (!subjects.length) { toast('لا توجد مواد متاحة حالياً', 'err'); return; }

    var isEdit = !!existingSlot;
    var curDay = isEdit ? existingSlot.dayIdx : (typeof defaultDayIdx === 'number' ? defaultDayIdx : 0);
    var existingDayCount = plan.slots.filter(function (x) { return x.dayIdx === curDay; }).length;
    var defPerObj = settings.periods[existingDayCount % settings.periods.length] || DEFAULT_PERIODS[0];
    var curSubjId = isEdit ? existingSlot.subjectId : subjects[0].id;
    var curItemId = isEdit ? (existingSlot.itemId || '') : '';
    var curPeriod = isEdit ? (existingSlot.periodLabel || defPerObj.label) : defPerObj.label;
    var curTime   = isEdit ? (existingSlot.timeLabel || defPerObj.time) : defPerObj.time;
    var curCustom = isEdit ? (existingSlot.customTitle || '') : '';
    var curNote   = isEdit ? (existingSlot.note || '') : '';

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" style="max-width:540px">' +
        '<h3>' + svgIcon(isEdit ? 'pencil' : 'plus') + ' ' + (isEdit ? 'تعديل الحصة الدراسية' : 'إضافة حصة إلى استعمال الزمن') + '</h3>' +
        '<div class="field">' +
          '<span>اليوم</span>' +
          '<select class="inp" id="slDaySel">' +
            WEEK_DAYS.map(function (d) {
              return '<option value="' + d.idx + '"' + (d.idx === curDay ? ' selected' : '') + '>' + d.name + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<div class="frm-row" style="gap:10px">' +
          '<div class="field" style="flex:1">' +
            '<span>الفترة</span>' +
            '<input class="inp" id="slPeriodInp" value="' + escapeHtml(curPeriod) + '" placeholder="مثال: الفترة المسائية">' +
          '</div>' +
          '<div class="field" style="flex:1">' +
            '<span>التوقيت</span>' +
            '<input class="inp" id="slTimeInp" dir="ltr" value="' + escapeHtml(curTime) + '" placeholder="19:30 - 21:30">' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<span>المادة الدراسية</span>' +
          '<select class="inp" id="slSubjSel">' +
            subjects.map(function (s) {
              return '<option value="' + s.id + '"' + (s.id === curSubjId ? ' selected' : '') + '>' +
                escapeHtml(s.name) + ' (المعامل ' + getSubjectCoefficient(s) + ')</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<div class="field">' +
          '<span>الدرس أو التمرين المطلوب قراءته (مرتّب حسب المنهج)</span>' +
          '<select class="inp" id="slItemSel"></select>' +
        '</div>' +
        '<div class="field">' +
          '<span>عنوان مخصص للحصة (اختياري — اتركه فارغاً لاعتماد عنوان الدرس المختار)</span>' +
          '<input class="inp" id="slCustomInp" value="' + escapeHtml(curCustom) + '" placeholder="مثال: حل موضوع بكالوريا 2025 / مراجعة القوانين">' +
        '</div>' +
        '<div class="field">' +
          '<span>ملاحظة توجيهية للطالبة (اختياري)</span>' +
          '<input class="inp" id="slNoteInp" value="' + escapeHtml(curNote) + '" placeholder="مثال: التركيز على المناقشة البيانية">' +
        '</div>' +
        '<div class="acts">' +
          '<button type="button" class="btn" data-close>' + svgIcon('x') + ' إلغاء</button>' +
          '<button type="button" class="btn btn-primary" id="slSaveBtn">' + svgIcon('check') + ' حفظ في استعمال الزمن</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    var subjSel = $('#slSubjSel', overlay);
    var itemSel = $('#slItemSel', overlay);

    function populateItemsForSubject(sid, selectedId) {
      var subObj = data.subjects.find(function (x) { return x.id === sid; });
      if (!subObj) { itemSel.innerHTML = '<option value="">— حصة مراجعة حرة —</option>'; return; }
      var seq = buildSubjectSequence(data, subObj, true);
      var optsHTML = '<option value="">— حصة مراجعة حرة / عنوان مخصص —</option>' +
        seq.map(function (entry) {
          var prefix = entry.itemType === 'exercise' ? ('[تمرين ' + entry.seqNum + '] ') : ('[درس ' + entry.seqNum + '] ');
          var doneMark = entry.completed ? ' ✓ (مكتمل)' : '';
          return '<option value="' + entry.itemId + '"' + (entry.itemId === selectedId ? ' selected' : '') + '>' +
            escapeHtml(prefix + entry.unitTitle + ' — ' + entry.title + doneMark) +
          '</option>';
        }).join('');
      itemSel.innerHTML = optsHTML;
    }

    populateItemsForSubject(curSubjId, curItemId);
    subjSel.addEventListener('change', function () {
      populateItemsForSubject(this.value, '');
    });

    function close() { overlay.remove(); }
    overlay.querySelector('[data-close]').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    $('#slSaveBtn', overlay).addEventListener('click', function () {
      var chosenDay = +$('#slDaySel', overlay).value;
      var chosenSubj = subjSel.value;
      var chosenItem = itemSel.value;
      var chosenPeriod = $('#slPeriodInp', overlay).value.trim() || 'حصة دراسية';
      var chosenTime   = $('#slTimeInp', overlay).value.trim() || '';
      var chosenCustom = $('#slCustomInp', overlay).value.trim();
      var chosenNote   = $('#slNoteInp', overlay).value.trim();

      var foundItem = chosenItem ? data.lessons.find(function (l) { return l.id === chosenItem; }) : null;
      var foundUnit = foundItem ? data.units.find(function (u) { return u.id === foundItem.unitId; }) : null;

      plan.cycleKey = getStudyCycleInfo().cycleKey;

      if (isEdit) {
        existingSlot.dayIdx = chosenDay;
        existingSlot.subjectId = chosenSubj;
        existingSlot.itemId = chosenItem;
        existingSlot.itemType = foundItem ? (isExerciseItem(foundItem) ? 'exercise' : 'lesson') : 'review';
        existingSlot.unitId = foundUnit ? foundUnit.id : '';
        existingSlot.unitTitle = foundUnit ? foundUnit.title : '';
        existingSlot.periodLabel = chosenPeriod;
        existingSlot.timeLabel = chosenTime;
        existingSlot.customTitle = chosenCustom;
        existingSlot.note = chosenNote;
        existingSlot.isManual = true;
      } else {
        var dayCount = plan.slots.filter(function (x) { return x.dayIdx === chosenDay; }).length;
        plan.slots.push({
          id: uid('sl'),
          dayIdx: chosenDay,
          periodIdx: dayCount,
          periodLabel: chosenPeriod,
          timeLabel: chosenTime,
          subjectId: chosenSubj,
          itemId: chosenItem,
          itemType: foundItem ? (isExerciseItem(foundItem) ? 'exercise' : 'lesson') : 'review',
          unitId: foundUnit ? foundUnit.id : '',
          unitTitle: foundUnit ? foundUnit.title : '',
          seqOrder: dayCount + 1,
          curriculumNum: 0,
          customTitle: chosenCustom || (!foundItem ? 'مراجعة حرة' : ''),
          note: chosenNote,
          sessionKind: foundItem ? (isExerciseItem(foundItem) ? 'exercise' : 'lesson') : 'review',
          isManual: true
        });
      }

      persistScheduleState(plan, settings, true);
      close();
      renderAll();
      toast(isEdit ? 'تم حفظ تعديلات الحصة ومزامنتها سحابياً' : 'تمت إضافة الحصة في استعمال الزمن ومزامنتها سحابياً');
    });
  }

  function openScheduleSettingsModal() {
    if (!isAdmin) return;
    var old = document.querySelector('.modal-overlay');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" style="max-width:540px">' +
        '<h3>' + svgIcon('sliders') + ' إعدادات استعمال الزمن الأسبوعي (للأدمن)</h3>' +
        '<div class="field">' +
          '<span>عدد الحصص اليومية المعتادة</span>' +
          '<select class="inp" id="stSessionsPerDay">' +
            [2, 3, 4, 5].map(function (n) {
              return '<option value="' + n + '"' + (settings.sessionsPerDay === n ? ' selected' : '') + '>' + n + ' حصص في اليوم</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<div class="field">' +
          '<span>يوم مخفّف في الأسبوع (حصة أقل للراحة والمراجعة الخفيفة)</span>' +
          '<select class="inp" id="stLightDay">' +
            '<option value="-1"' + (settings.lightDayIdx === -1 ? ' selected' : '') + '>بدون تخفيف (كل الأيام بنفس العدد)</option>' +
            WEEK_DAYS.map(function (d) {
              return '<option value="' + d.idx + '"' + (settings.lightDayIdx === d.idx ? ' selected' : '') + '>' + d.name + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<label class="copy-unit-check" style="margin:8px 0">' +
          '<input type="checkbox" id="stIncEx"' + (settings.includeExercises ? ' checked' : '') + '>' +
          '<span>إدراج التمارين المستقلة للوحدات تلقائياً بعد دروس كل وحدة</span>' +
        '</label>' +
        '<label class="copy-unit-check" style="margin:8px 0">' +
          '<input type="checkbox" id="stAutoRenew"' + (settings.autoRenew !== false ? ' checked' : '') + '>' +
          '<span>تفعيل التجديد التلقائي كل يوم سبت على الساعة 10:00 ليلاً (مع استبعاد المكتمل)</span>' +
        '</label>' +
        '<div class="field">' +
          '<span>أوقات الفترات اليومية المعتمدة</span>' +
          '<div style="display:grid;gap:8px;margin-top:6px">' +
            settings.periods.slice(0, 4).map(function (p, idx) {
              return '<div class="frm-row" style="gap:8px">' +
                '<input class="inp" data-plbl="' + idx + '" value="' + escapeHtml(p.label) + '" placeholder="اسم الفترة">' +
                '<input class="inp" dir="ltr" data-ptime="' + idx + '" value="' + escapeHtml(p.time) + '" placeholder="08:30 - 10:30">' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="acts">' +
          '<button type="button" class="btn" data-close>' + svgIcon('x') + ' إلغاء</button>' +
          '<button type="button" class="btn" id="stSaveOnlyBtn">' + svgIcon('check') + ' حفظ الإعدادات فقط</button>' +
          '<button type="button" class="btn btn-primary" id="stApplyBtn">' + svgIcon('wand') + ' حفظ وتوليد الجدول الآن</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    function close() { overlay.remove(); }
    overlay.querySelector('[data-close]').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    function collectSettingsForm() {
      settings.sessionsPerDay = +$('#stSessionsPerDay', overlay).value || 3;
      settings.lightDayIdx = +$('#stLightDay', overlay).value;
      settings.includeExercises = $('#stIncEx', overlay).checked;
      settings.autoRenew = $('#stAutoRenew', overlay).checked;
      $all('[data-plbl]', overlay).forEach(function (inp) {
        var i = +inp.dataset.plbl;
        var tInp = $('[data-ptime="' + i + '"]', overlay);
        settings.periods[i] = {
          label: inp.value.trim() || DEFAULT_PERIODS[i].label,
          time: (tInp && tInp.value.trim()) || DEFAULT_PERIODS[i].time
        };
      });
    }

    $('#stSaveOnlyBtn', overlay).addEventListener('click', function () {
      collectSettingsForm();
      persistScheduleState(plan, settings, true);
      close();
      renderAll();
      toast('تم حفظ إعدادات استعمال الزمن في السحابة');
    });

    $('#stApplyBtn', overlay).addEventListener('click', function () {
      collectSettingsForm();
      plan = generateWeeklySchedulePlan(data, getStudyCycleInfo(), settings);
      persistScheduleState(plan, settings, true);
      close();
      renderAll();
      toast('تم حفظ الإعدادات وتوليد استعمال الزمن ومزامنته سحابياً!');
    });
  }

  /* أحداث تبديل العرض */
  $all('[data-sview]', rootEl).forEach(function (tabBtn) {
    tabBtn.addEventListener('click', function () {
      activeView = tabBtn.dataset.sview;
      $all('[data-sview]', rootEl).forEach(function (x) { x.classList.toggle('active', x === tabBtn); });
      renderAll();
    });
  });

  if (isAdmin) {
    var addBtn = $('#addManualSlotBtn', rootEl);
    if (addBtn) addBtn.addEventListener('click', function () { openSlotEditorModal(null, new Date().getDay()); });

    var setBtn = $('#openSchedSettingsBtn', rootEl);
    if (setBtn) setBtn.addEventListener('click', openScheduleSettingsModal);

    var regenBtn = $('#regenSchedBtn', rootEl);
    if (regenBtn) {
      regenBtn.addEventListener('click', function () {
        if (plan.slots.length && !confirm('توليد استعمال الزمن تلقائياً حسب معامل كل مادة وتسلسل الدروس غير المكتملة؟ (سيحل محل الحصص الحالية)')) {
          return;
        }
        plan = generateWeeklySchedulePlan(data, getStudyCycleInfo(), settings);
        persistScheduleState(plan, settings, true);
        renderAll();
        toast('تم توليد استعمال الزمن حسب المعاملات وحفظه في السحابة!');
      });
    }

    var clearBtn = $('#clearSchedBtn', rootEl);
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (!plan.slots.length) { toast('الجدول فارغ بالفعل', 'info'); return; }
        if (!confirm('تفريغ جميع حصص استعمال الزمن الحالي لبنائه يدوياً من الصفر؟')) return;
        plan = { cycleKey: getStudyCycleInfo().cycleKey, generatedAt: new Date().toISOString(), quotas: {}, slots: [] };
        persistScheduleState(plan, settings, true);
        renderAll();
        toast('تم تفريغ الجدول — يمكنك الآن إضافة الحصص يدوياً أو التوليد التلقائي', 'info');
      });
    }
  } else {
    var printBtn = $('#printSchedBtn', rootEl);
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
  }

  /* أحداث التفاعل داخل الجدول */
  $('#schedMainMount', rootEl).addEventListener('click', function (e) {
    var btn = e.target.closest('[data-sact]');
    if (!btn) return;
    var act = btn.dataset.sact;
    var slotId = btn.dataset.id;
    var slot = slotId ? plan.slots.find(function (s) { return s.id === slotId; }) : null;

    if (act === 'toggle-done' && slot) {
      var cKey = slotCompletionKey(slot);
      var nowDone = toggleItemCompleted(cKey);
      renderAll();
      toast(
        nowDone
          ? 'ممتاز! تحولت الحصة إلى اللون الأخضر كمكتملة ولن تتكرر في استعمال الزمن للأسبوع القادم'
          : 'تم إلغاء علامة الإكمال عن هذه الحصة',
        nowDone ? 'ok' : 'info'
      );
      return;
    }

    /* بقية الإجراءات الإدارية مسموحة للأدمن فقط */
    if (!isAdmin) return;

    if (act === 'quick-generate') {
      plan = generateWeeklySchedulePlan(data, getStudyCycleInfo(), settings);
      persistScheduleState(plan, settings, true);
      renderAll();
      toast('تم توليد استعمال الزمن الأسبوعي وحفظه في السحابة!');
    } else if (act === 'add-to-day') {
      openSlotEditorModal(null, +btn.dataset.day);
    } else if (act === 'edit-slot' && slot) {
      openSlotEditorModal(slot, slot.dayIdx);
    } else if (act === 'del-slot' && slot) {
      if (confirm('حذف هذه الحصة من استعمال الزمن؟')) {
        plan.slots = plan.slots.filter(function (s) { return s.id !== slot.id; });
        persistScheduleState(plan, settings, true);
        renderAll();
        toast('تم حذف الحصة وحفظ الجدول في السحابة', 'info');
      }
    } else if ((act === 'move-up' || act === 'move-down') && slot) {
      var sameDay = plan.slots
        .filter(function (s) { return s.dayIdx === slot.dayIdx; })
        .sort(function (a, b) { return (a.periodIdx || 0) - (b.periodIdx || 0); });
      var idx = sameDay.findIndex(function (s) { return s.id === slot.id; });
      var swapIdx = act === 'move-up' ? idx - 1 : idx + 1;
      if (swapIdx >= 0 && swapIdx < sameDay.length) {
        var other = sameDay[swapIdx];
        var tmpP = slot.periodIdx, tmpLbl = slot.periodLabel, tmpTime = slot.timeLabel;
        slot.periodIdx = other.periodIdx; slot.periodLabel = other.periodLabel; slot.timeLabel = other.timeLabel;
        other.periodIdx = tmpP; other.periodLabel = tmpLbl; other.timeLabel = tmpTime;
        if (slot.periodIdx === other.periodIdx) {
          slot.periodIdx = swapIdx;
          other.periodIdx = idx;
        }
        persistScheduleState(plan, settings, true);
        renderAll();
      }
    } else if (act === 'toggle-subj-card') {
      var subId = btn.dataset.sub;
      adminOpenSubjCards[subId] = !adminOpenSubjCards[subId];
      renderAll();
    }
  });

  if (!window._ayaSchedCompletionListenerBound) {
    window._ayaSchedCompletionListenerBound = true;
    window.addEventListener('aya:completion-changed', function () {
      if (typeof window._ayaCurrentSchedRefresh === 'function') {
        window._ayaCurrentSchedRefresh();
      }
    });
  }
  window._ayaCurrentSchedRefresh = renderAll;

  renderAll();
  tickCountdown();
  window._ayaActiveSchedTimer = setInterval(tickCountdown, 1000);
}

/* تهيئة صفحة المستخدم (schedule.html — عرض فقط + زر الإكمال الأخضر دون أزرار إضافة/تعديل) */
function initSchedulePage() {
  requireAuth();
  hydrateIcons();
  var data = loadData();

  var crumbsEl = $('#crumbs');
  if (crumbsEl) {
    crumbsEl.innerHTML = breadcrumb([
      { label: 'الرئيسية', href: 'home.html', icon: 'home' },
      { label: 'استعمال الزمن الدراسي الأسبوعي' }
    ]);
  }

  var rootEl = $('#studentScheduleRoot');
  if (rootEl) {
    mountScheduleWorkspace(rootEl, { adminMode: false, data: data });
  }

  var logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
}

/* عرض لوحة إدارة وإضافة استعمال الزمن داخل admin.html (للأدمن فقط) */
function renderAdminSchedulePanel(panelEl, adminData) {
  panelEl.innerHTML = '<div id="adminScheduleRoot"></div>';
  mountScheduleWorkspace($('#adminScheduleRoot', panelEl), {
    adminMode: true,
    data: adminData || loadData()
  });
}
