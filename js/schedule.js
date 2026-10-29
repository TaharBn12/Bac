/* ============================================================
   آية باك 2027 — استعمال الزمن الدراسي الأسبوعي الذكي
   - يتجدد تلقائياً كل يوم سبت على الساعة 22:00 (10:00 ليلاً)
   - يوزّع الحصص والدروس حسب معامل كل مادة وبالتسلسل المنهجي للدروس
   - يلوّن الدروس/التمارين المكتملة بالأخضر في الأسبوع الحالي ويستبعدها من الأسبوع القادم
   - يدعم التعديل اليدوي الكامل (إضافة / تعديل / نقل / حذف / تخصيص الفترات)
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

function loadScheduleSettings() {
  var defaults = {
    sessionsPerDay: 3,
    lightDayIdx: 5,          /* الجمعة يوم مخفّف افتراضياً (حصتان بدل 3، أو -1 لإلغاء التخفيف) */
    includeExercises: true,  /* إدراج تمارين الوحدة ضمن تسلسل المراجعة */
    periods: DEFAULT_PERIODS.map(function (p) { return { label: p.label, time: p.time }; })
  };
  try {
    var raw = localStorage.getItem(SCHED_SETTINGS_KEY);
    if (!raw) return defaults;
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    var spd = Math.max(1, Math.min(5, parseInt(parsed.sessionsPerDay, 10) || 3));
    var light = typeof parsed.lightDayIdx === 'number' ? parsed.lightDayIdx : 5;
    var incEx = parsed.includeExercises !== false;
    var periods = Array.isArray(parsed.periods) && parsed.periods.length >= 5
      ? parsed.periods
      : defaults.periods;
    return {
      sessionsPerDay: spd,
      lightDayIdx: light,
      includeExercises: incEx,
      periods: periods
    };
  } catch (e) {
    return defaults;
  }
}

function saveScheduleSettings(settings) {
  try {
    localStorage.setItem(SCHED_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) { /* تجاهل */ }
}

function loadSavedPlan() {
  try {
    var raw = localStorage.getItem(SCHED_PLAN_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return (parsed && parsed.cycleKey && Array.isArray(parsed.slots)) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function savePlan(plan) {
  try {
    localStorage.setItem(SCHED_PLAN_KEY, JSON.stringify(plan));
  } catch (e) { /* تجاهل */ }
}

/* بناء التسلسل الكامل المرتب لعناصر المادة (الوحدة 1: دروسها بالترتيب ثم تمارينها، تليها الوحدة 2...) */
function buildSubjectSequence(data, subject, includeExercises) {
  var seq = [];
  var units = unitsOf(data, subject.id);
  var lessonSeqNum = 0;
  var exSeqNum = 0;

  units.forEach(function (u, uIdx) {
    var ls = lessonsOf(data, u.id);
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
      var exs = unitExercisesOf(data, u.id);
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

/* حساب سعة الأيام الـ 7 حسب إعدادات المستخدم */
function buildDayCapacities(settings) {
  return WEEK_DAYS.map(function (d) {
    if (settings.lightDayIdx === d.idx) {
      return Math.max(1, settings.sessionsPerDay - 1);
    }
    return settings.sessionsPerDay;
  });
}

/* توزيع الحصص الأسبوعية بين المواد تناسبياً مع معامل كل مادة (طريقة البواقي الكبرى Hamilton) */
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
    /* إذا كان عدد الحصص الإجمالي يكفي جميع المواد نضمن حصة واحدة على الأقل لكل مادة */
    if (totalSlots >= subjects.length && base === 0) base = 1;
    quotas[sub.id] = base;
    assigned += base;
    remainders.push({ id: sub.id, rem: exact - Math.floor(exact), coeff: coeff, idx: idx });
  });

  /* ضبط الفائض أو النقص ليطابق إجمالي الحصص الأسبوعية تماماً */
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

/* توليد جدول الأسبوع تلقائياً لدورة السبت 22:00 الحالية (يستبعد كل ما أُكمل سابقاً!) */
function generateWeeklySchedulePlan(data, cycleInfo, settings) {
  var subjects = visibleSubjectsOf(data);
  var dayCaps = buildDayCapacities(settings);
  var totalSlots = dayCaps.reduce(function (a, b) { return a + b; }, 0);
  var quotas = allocateQuotasByCoefficient(subjects, totalSlots);

  /* بناء قائمة حصص كل مادة بالترتيب المنهجي (الدروس والتمارين غير المكتملة أولاً) */
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
        /* إذا كان معامل المادة كبيراً يمنحها حصصاً إضافية بعد إنهاء الدروس المتاحة، نخصصها لتثبيت وحل تطبيقات على نفس دروس هذا الأسبوع */
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
        /* كل دروس هذه المادة مكتملة! نضع حصة مراجعة شاملة خفيفة */
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

  /* توزيع متوازن على أيام الأسبوع الـ 7 بحيث لا تتكدس حصص نفس المادة في يوم واحد */
  var dayBuckets = WEEK_DAYS.map(function () { return []; });
  var sortedSubjs = subjects.slice().sort(function (a, b) {
    return getSubjectCoefficient(b) - getSubjectCoefficient(a);
  });

  var dayCursor = 0;
  sortedSubjs.forEach(function (sub) {
    var list = bundlesBySubj[sub.id] || [];
    list.forEach(function (slotItem) {
      /* نبحث عن أفضل يوم متاح لم يمتلئ بعد ويحتوي أقل عدد من حصص هذه المادة */
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

  /* تحويل السلال اليومية إلى مصفوفة حصص مرتبة مع أوقات الفترات */
  var finalSlots = [];
  dayBuckets.forEach(function (bucket, dIdx) {
    bucket.forEach(function (s, pIdx) {
      var per = settings.periods[pIdx] || DEFAULT_PERIODS[pIdx % DEFAULT_PERIODS.length];
      finalSlots.push({
        id: uid('sl'),
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

/* ============================================================
   تهيئة وعرض صفحة استعمال الزمن (schedule.html)
   ============================================================ */
function initSchedulePage() {
  requireAuth();
  hydrateIcons();
  var data = loadData();

  $('#crumbs').innerHTML = breadcrumb([
    { label: 'الرئيسية', href: 'home.html', icon: 'home' },
    { label: 'استعمال الزمن الدراسي الأسبوعي' }
  ]);

  var settings = loadScheduleSettings();
  var cycle = getStudyCycleInfo();
  var plan = loadSavedPlan();

  /* إذا لم تكن هناك خطة محفوظة أو دخلنا في دورة سبت 10:00 ليلاً جديدة → تتجدد تلقائياً! */
  if (!plan || plan.cycleKey !== cycle.cycleKey) {
    var wasPreviousCycle = !!(plan && plan.cycleKey && plan.cycleKey !== cycle.cycleKey);
    plan = generateWeeklySchedulePlan(data, cycle, settings);
    savePlan(plan);
    if (wasPreviousCycle) {
      setTimeout(function () {
        toast('تجدّد استعمال الزمن الأسبوعي تلقائياً (دورة السبت 10:00 ليلاً) مع استبعاد الدروس المكتملة!');
      }, 300);
    }
  }

  var activeView = 'days'; /* 'days' | 'subjects' */
  var openSubjectCards = {}; /* لفتح المادة الأولى فقط افتراضياً والبقية بزر سهم */

  function resolveSlotDetails(slot) {
    var subj = data.subjects.find(function (s) { return s.id === slot.subjectId; }) ||
      { id: slot.subjectId, name: 'مادة دراسية', icon: 'book', color: 'indigo', coefficient: 2 };
    var itemObj = slot.itemId ? data.lessons.find(function (l) { return l.id === slot.itemId; }) : null;
    var unitObj = (itemObj && data.units.find(function (u) { return u.id === itemObj.unitId; })) ||
      (slot.unitId ? data.units.find(function (u) { return u.id === slot.unitId; }) : null);

    var displayTitle = slot.customTitle || (itemObj ? itemObj.title : 'حصة مراجعة');
    var unitTitle = unitObj ? unitObj.title : (slot.unitTitle || '');
    var completed = slot.itemId ? isItemCompleted(slot.itemId) : !!slot.manualDone;
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
    $('#schedCycleDates').innerHTML =
      svgIcon('calendar') + ' أسبوع المراجعة من <b>الأحد ' + fmtArabicShortDate(cycle.sundayStart) +
      '</b> إلى <b>السبت ' + fmtArabicShortDate(cycle.saturdayEnd) + '</b> — يتجدد كل سبت على <b>10:00 ليلاً</b>';

    var totalWeekSlots = plan.slots.length;
    var doneWeekSlots = plan.slots.filter(function (sl) { return resolveSlotDetails(sl).completed; }).length;
    var pct = totalWeekSlots ? Math.round((doneWeekSlots / totalWeekSlots) * 100) : 0;

    var allSubjects = visibleSubjectsOf(data);
    var totalCurr = 0, doneCurr = 0;
    allSubjects.forEach(function (s) {
      unitsOf(data, s.id).forEach(function (u) {
        lessonsOf(data, u.id).concat(unitExercisesOf(data, u.id)).forEach(function (it) {
          totalCurr++;
          if (isItemCompleted(it.id)) doneCurr++;
        });
      });
    });

    $('#schedStatsRow').innerHTML =
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

    /* شريط معاملات المواد وحصصها الأسبوعية */
    var sortedByCoeff = allSubjects.slice().sort(function (a, b) {
      return getSubjectCoefficient(b) - getSubjectCoefficient(a);
    });
    $('#schedCoeffStrip').innerHTML = sortedByCoeff.map(function (s) {
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

  /* تحديث العداد التنازلي كل ثانية + التجديد الفوري إن حانت الساعة 22:00 يوم السبت */
  function tickCountdown() {
    var nowCycle = getStudyCycleInfo();
    if (nowCycle.cycleKey !== plan.cycleKey) {
      plan = generateWeeklySchedulePlan(data, nowCycle, settings);
      savePlan(plan);
      renderAll();
      toast('حان موعد السبت 10:00 ليلاً — تم تجديد استعمال الزمن للأسبوع الجديد تلقائياً!');
      return;
    }
    var r = nowCycle.remaining;
    var elD = $('#cdDays'), elH = $('#cdHours'), elM = $('#cdMins'), elS = $('#cdSecs');
    if (elD) elD.textContent = String(r.days).padStart(2, '0');
    if (elH) elH.textContent = String(r.hours).padStart(2, '0');
    if (elM) elM.textContent = String(r.minutes).padStart(2, '0');
    if (elS) elS.textContent = String(r.seconds).padStart(2, '0');
  }

  /* 1) العرض اليومي (الأحد ← السبت) */
  function renderDaysView(mount) {
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
          '<button type="button" class="btn btn-sm" data-sact="add-to-day" data-day="' + day.idx + '">' +
            svgIcon('plus') + ' حصة لهذا اليوم' +
          '</button>' +
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
                (sl.isManual ? '<span class="manual-tag">يدوي</span>' : '') +
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
                    ? '<a href="lesson.html?lesson=' + encodeURIComponent(det.item.id) + '">' + escapeHtml(det.displayTitle) + '</a>'
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
                  ? '<a class="btn btn-sm slot-open-btn" href="lesson.html?lesson=' + encodeURIComponent(det.item.id) + '" title="فتح صفحة الدرس أو التمرين">' +
                      svgIcon('eye') + '<span>فتح</span>' +
                    '</a>'
                  : '') +
                '<div class="slot-mini-tools">' +
                  '<button type="button" class="mini-ic-btn" data-sact="move-up" data-id="' + sl.id + '" title="تقديم الفترة"' + (sIdx === 0 ? ' disabled' : '') + '>' + svgIcon('chevron-up') + '</button>' +
                  '<button type="button" class="mini-ic-btn" data-sact="move-down" data-id="' + sl.id + '" title="تأخير الفترة"' + (sIdx === daySlots.length - 1 ? ' disabled' : '') + '>' + svgIcon('chevron-down') + '</button>' +
                  '<button type="button" class="mini-ic-btn" data-sact="edit-slot" data-id="' + sl.id + '" title="تعديل يدوي للحصة">' + svgIcon('pencil') + '</button>' +
                  '<button type="button" class="mini-ic-btn danger" data-sact="del-slot" data-id="' + sl.id + '" title="حذف الحصة من الجدول">' + svgIcon('trash') + '</button>' +
                '</div>' +
              '</div>' +
            '</article>';
          }).join('') : '<div class="empty" style="padding:18px">يوم راحة — يمكنك إضافة حصة يدوية إن رغبتِ</div>') +
        '</div>' +
      '</section>';
    }).join('') + '</div>';
  }

  /* 2) عرض تفصيل كل مادة وما يجب قراءته بالترتيب المنهجي */
  function renderSubjectsBreakdownView(mount) {
    var subjects = visibleSubjectsOf(data).slice().sort(function (a, b) {
      return getSubjectCoefficient(b) - getSubjectCoefficient(a);
    });

    if (subjects.length && Object.keys(openSubjectCards).length === 0) {
      openSubjectCards[subjects[0].id] = true; /* فتح المادة الأولى فقط افتراضياً والبقية بزر سهم */
    }

    mount.innerHTML =
      '<div class="sec-subtools-bar" style="margin-bottom:12px">' +
        '<span class="hint" style="margin:0">تفصيل ما يجب قراءته في كل مادة مرتّباً حسب تسلسل الوحدات والدروس وبكثافة تتناسب مع معامل المادة:</span>' +
        '<button type="button" class="btn btn-sm" id="toggleAllSubjPlanBtn">' + svgIcon('chevron-down') + ' فتح / طي كل المواد</button>' +
      '</div>' +
      '<div class="sched-subjects-stack">' +
      subjects.map(function (sub) {
        var coeff = getSubjectCoefficient(sub);
        var subjSlots = plan.slots.filter(function (sl) { return sl.subjectId === sub.id; });
        var fullSeq = buildSubjectSequence(data, sub, settings.includeExercises);
        var doneInSubj = fullSeq.filter(function (it) { return it.completed; }).length;
        var isOpen = !!openSubjectCards[sub.id];

        /* الدروس القادمة للأسبوع المقبل (التي تلي حصص هذا الأسبوع ولم تُكمل بعد) */
        var scheduledIds = {};
        subjSlots.forEach(function (sl) { if (sl.itemId) scheduledIds[sl.itemId] = true; });
        var nextWeekQueue = fullSeq.filter(function (it) { return !it.completed && !scheduledIds[it.itemId]; }).slice(0, 4);

        return '<section class="sched-subj-plan-card c-' + (sub.color || 'indigo') + (isOpen ? ' is-open' : ' is-collapsed') + '" data-sub-plan="' + sub.id + '">' +
          '<div class="sspc-head" data-sact="toggle-subj-card" data-sub="' + sub.id + '" role="button" tabindex="0">' +
            '<div class="sspc-title">' +
              '<div class="sspc-ico">' + iconHTML(sub.icon, 'book') + '</div>' +
              '<div>' +
                '<h3>' + escapeHtml(sub.name) + ' <span class="subj-coeff-badge">المعامل ' + coeff + '</span></h3>' +
                '<small>' + subjSlots.length + ' حصص مبرمجة هذا الأسبوع · أُنجز من المنهج ' + doneInSubj + ' من ' + fullSeq.length + '</small>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="btn-acc-arrow' + (isOpen ? ' open' : '') + '">' +
              '<span>' + (isOpen ? 'إخفاء التفصيل' : 'إظهار ما يجب قراءته') + '</span>' + svgIcon('chevron-down') +
            '</button>' +
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
                          ? '<a href="lesson.html?lesson=' + encodeURIComponent(det.item.id) + '">' + escapeHtml(det.displayTitle) + '</a>'
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
                  '<strong>' + svgIcon('clock') + ' الدروس التالية في الترتيب (ستُدرج تلقائياً في الأسبوع المقبل بعد إكمال الحالية):</strong>' +
                  '<div class="sspc-next-chips">' +
                    nextWeekQueue.map(function (nq) {
                      return '<a class="sspc-next-chip" href="lesson.html?lesson=' + encodeURIComponent(nq.itemId) + '">' +
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

    var toggleAllBtn = $('#toggleAllSubjPlanBtn', mount);
    if (toggleAllBtn) {
      toggleAllBtn.addEventListener('click', function () {
        var anyClosed = subjects.some(function (s) { return !openSubjectCards[s.id]; });
        subjects.forEach(function (s, idx) {
          openSubjectCards[s.id] = anyClosed ? true : (idx === 0);
        });
        renderSubjectsBreakdownView(mount);
      });
    }
  }

  function renderAll() {
    renderTopSummary();
    var mount = $('#schedMainMount');
    if (activeView === 'days') renderDaysView(mount);
    else renderSubjectsBreakdownView(mount);
  }

  /* نافذة إضافة أو تعديل حصة يدوياً */
  function openSlotEditorModal(existingSlot, defaultDayIdx) {
    var old = document.querySelector('.modal-overlay');
    if (old) old.remove();

    var subjects = visibleSubjectsOf(data);
    if (!subjects.length) { toast('لا توجد مواد متاحة حالياً', 'err'); return; }

    var isEdit = !!existingSlot;
    var curDay = isEdit ? existingSlot.dayIdx : (typeof defaultDayIdx === 'number' ? defaultDayIdx : 0);
    var curSubjId = isEdit ? existingSlot.subjectId : subjects[0].id;
    var curItemId = isEdit ? (existingSlot.itemId || '') : '';
    var curPeriod = isEdit ? (existingSlot.periodLabel || DEFAULT_PERIODS[0].label) : DEFAULT_PERIODS[0].label;
    var curTime   = isEdit ? (existingSlot.timeLabel || DEFAULT_PERIODS[0].time) : DEFAULT_PERIODS[0].time;
    var curCustom = isEdit ? (existingSlot.customTitle || '') : '';
    var curNote   = isEdit ? (existingSlot.note || '') : '';

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" style="max-width:540px">' +
        '<h3>' + svgIcon(isEdit ? 'pencil' : 'plus') + ' ' + (isEdit ? 'تعديل الحصة الدراسية يدوياً' : 'إضافة حصة دراسية يدوية') + '</h3>' +
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
          '<span>عنوان مخصص للحصة (اختياري — اتركيه فارغاً لاعتماد عنوان الدرس المختار)</span>' +
          '<input class="inp" id="slCustomInp" value="' + escapeHtml(curCustom) + '" placeholder="مثال: حل موضوع بكالوريا 2025 / مراجعة القوانين">' +
        '</div>' +
        '<div class="field">' +
          '<span>ملاحظة صغيرة (اختياري)</span>' +
          '<input class="inp" id="slNoteInp" value="' + escapeHtml(curNote) + '" placeholder="مثال: التركيز على المناقشة البيانية">' +
        '</div>' +
        '<div class="acts">' +
          '<button type="button" class="btn" data-close>' + svgIcon('x') + ' إلغاء</button>' +
          '<button type="button" class="btn btn-primary" id="slSaveBtn">' + svgIcon('check') + ' حفظ الحصة</button>' +
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

      savePlan(plan);
      close();
      renderAll();
      toast(isEdit ? 'تم حفظ التعديلات على الحصة' : 'تمت إضافة الحصة اليدوية إلى استعمال الزمن');
    });
  }

  /* نافذة إعدادات التوزيع والأوقات */
  function openScheduleSettingsModal() {
    var old = document.querySelector('.modal-overlay');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" style="max-width:540px">' +
        '<h3>' + svgIcon('sliders') + ' إعدادات توزيع استعمال الزمن</h3>' +
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
        '<label class="copy-unit-check" style="margin:10px 0">' +
          '<input type="checkbox" id="stIncEx"' + (settings.includeExercises ? ' checked' : '') + '>' +
          '<span>إدراج التمارين المستقلة للوحدات تلقائياً بعد دروس كل وحدة</span>' +
        '</label>' +
        '<div class="field">' +
          '<span>أوقات الفترات اليومية (يمكنك تعديلها بحرية)</span>' +
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
          '<button type="button" class="btn btn-primary" id="stApplyBtn">' + svgIcon('wand') + ' حفظ وإعادة توزيع الجدول</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    function close() { overlay.remove(); }
    overlay.querySelector('[data-close]').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    $('#stApplyBtn', overlay).addEventListener('click', function () {
      settings.sessionsPerDay = +$('#stSessionsPerDay', overlay).value || 3;
      settings.lightDayIdx = +$('#stLightDay', overlay).value;
      settings.includeExercises = $('#stIncEx', overlay).checked;
      $all('[data-plbl]', overlay).forEach(function (inp) {
        var i = +inp.dataset.plbl;
        var tInp = $('[data-ptime="' + i + '"]', overlay);
        settings.periods[i] = {
          label: inp.value.trim() || DEFAULT_PERIODS[i].label,
          time: (tInp && tInp.value.trim()) || DEFAULT_PERIODS[i].time
        };
      });
      saveScheduleSettings(settings);
      plan = generateWeeklySchedulePlan(data, getStudyCycleInfo(), settings);
      savePlan(plan);
      close();
      renderAll();
      toast('تم حفظ الإعدادات وتوليد استعمال الزمن بالتوزيع الجديد!');
    });
  }

  /* أحداث شريط الأدوات */
  $all('[data-sview]').forEach(function (tabBtn) {
    tabBtn.addEventListener('click', function () {
      activeView = tabBtn.dataset.sview;
      $all('[data-sview]').forEach(function (x) { x.classList.toggle('active', x === tabBtn); });
      renderAll();
    });
  });

  $('#addManualSlotBtn').addEventListener('click', function () {
    openSlotEditorModal(null, new Date().getDay());
  });
  $('#openSchedSettingsBtn').addEventListener('click', openScheduleSettingsModal);
  $('#regenSchedBtn').addEventListener('click', function () {
    if (!confirm('إعادة توليد استعمال الزمن لهذا الأسبوع تلقائياً حسب معامل كل مادة واستبعاد الدروس المكتملة؟ (سيتم استبدال التعديلات اليدوية الحالية)')) {
      return;
    }
    plan = generateWeeklySchedulePlan(data, getStudyCycleInfo(), settings);
    savePlan(plan);
    renderAll();
    toast('تم تحديث استعمال الزمن تلقائياً حسب المعاملات والدروس المتبقية!');
  });
  $('#printSchedBtn').addEventListener('click', function () { window.print(); });

  /* أحداث التفاعل داخل الجدول وتفصيل المواد */
  $('#schedMainMount').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-sact]');
    if (!btn) return;
    var act = btn.dataset.sact;
    var slotId = btn.dataset.id;
    var slot = slotId ? plan.slots.find(function (s) { return s.id === slotId; }) : null;

    if (act === 'toggle-done' && slot) {
      var nowDone;
      if (slot.itemId) {
        nowDone = toggleItemCompleted(slot.itemId);
      } else {
        slot.manualDone = !slot.manualDone;
        nowDone = slot.manualDone;
        savePlan(plan);
      }
      renderAll();
      toast(
        nowDone
          ? 'ممتاز! تحولت الحصة إلى اللون الأخضر كمكتملة ولن تتكرر في استعمال الزمن للأسبوع القادم'
          : 'تم إلغاء علامة الإكمال عن هذه الحصة',
        nowDone ? 'ok' : 'info'
      );
    } else if (act === 'add-to-day') {
      openSlotEditorModal(null, +btn.dataset.day);
    } else if (act === 'edit-slot' && slot) {
      openSlotEditorModal(slot, slot.dayIdx);
    } else if (act === 'del-slot' && slot) {
      if (confirm('حذف هذه الحصة من استعمال الزمن الحالي؟')) {
        plan.slots = plan.slots.filter(function (s) { return s.id !== slot.id; });
        savePlan(plan);
        renderAll();
        toast('تم حذف الحصة من الجدول', 'info');
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
        savePlan(plan);
        renderAll();
      }
    } else if (act === 'toggle-subj-card') {
      var subId = btn.dataset.sub;
      openSubjectCards[subId] = !openSubjectCards[subId];
      renderAll();
    }
  });

  window.addEventListener('aya:completion-changed', function () {
    renderAll();
  });

  renderAll();
  tickCountdown();
  setInterval(tickCountdown, 1000);

  $('#logoutBtn').addEventListener('click', doLogout);
}
