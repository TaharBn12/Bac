/* ============================================================
   آية باك 2027 — الذكاء الاصطناعي والربط مع Claude + يوتيوب
   ------------------------------------------------------------
   • ربط الموقع مباشرة بحسابك في Claude (claude.ai / Claude Desktop) عبر MCP
   • استيراد قوائم تشغيل يوتيوب وتقسيمها تلقائياً حسب المادة ← الوحدة ← الدرس
   • مساعد دردشة إداري ذكي (يعمل مجاناً بالمحلل المدمج أو بمفتاح Claude API)
   ============================================================ */
'use strict';

var CLAUDE_API_STORAGE = 'ayaBacClaudeApiKey.v1';
var aiSubView = 'playlist'; /* 'playlist' | 'claude-mcp' | 'chat' */
var aiDraftState = {
  loading: false,
  saving: false,
  playlist: null,
  plan: null,
  mode: 'smart',
  lastResult: null,
  form: {
    url: '',
    subjectChoice: '__auto__',
    customSubjectName: '',
    unitChoice: '__auto__',
    customUnitTitle: '',
    groupingMode: 'smart',
    separateExercises: true,
    instructions: ''
  }
};
var aiChatHistory = [
  {
    role: 'assistant',
    content: 'أهلاً بك في المساعد الإداري الذكي لمنصة آية باك 2027! يمكنك إرسال رابط قائمة تشغيل يوتيوب هنا مباشرة لتحليلها وتقسيمها حسب المادة والوحدة والدرس، أو ربط حسابك في Claude لإدارة الموقع بالكامل من هناك.'
  }
];
var mcpHealthCache = null; /* null | 'ok' | 'err' */

function mcpFunctionBaseUrl() {
  return String(SUPABASE_URL || '').replace(/\/+$/, '') + '/functions/v1/aya-mcp';
}

function encodeBase64UrlUtf8(str) {
  var utf8 = encodeURIComponent(String(str || '')).replace(/%([0-9A-F]{2})/g, function (_, p1) {
    return String.fromCharCode(parseInt(p1, 16));
  });
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildClaudeMcpConnectorUrl() {
  var keyToken = encodeBase64UrlUtf8(ADMIN_PASS);
  return mcpFunctionBaseUrl() + '/k/' + keyToken;
}

function getSavedClaudeApiKey() {
  try { return localStorage.getItem(CLAUDE_API_STORAGE) || ''; } catch (e) { return ''; }
}

function setSavedClaudeApiKey(v) {
  try {
    if (v && v.trim()) localStorage.setItem(CLAUDE_API_STORAGE, v.trim());
    else localStorage.removeItem(CLAUDE_API_STORAGE);
  } catch (e) { /* تجاهل */ }
}

function copyTextToClipboard(text, successMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      toast(successMsg || 'تم النسخ إلى الحافظة');
    }).catch(function () { fallbackCopy(text, successMsg); });
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast(successMsg || 'تم النسخ إلى الحافظة'); }
  catch (e) { toast('تعذّر النسخ التلقائي — انسخ النص يدوياً', 'err'); }
  ta.remove();
}

function normArClient(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0600-\u06FFa-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* فحص حالة خادم MCP في الخلفية */
function checkMcpServerHealth(badgeEl) {
  fetch(mcpFunctionBaseUrl(), {
    method: 'GET',
    headers: { 'x-admin-key': ADMIN_PASS }
  }).then(function (r) { return r.json(); })
    .then(function (j) {
      mcpHealthCache = (j && j.ok) ? 'ok' : 'err';
      if (badgeEl) renderMcpBadge(badgeEl);
    })
    .catch(function () {
      mcpHealthCache = 'err';
      if (badgeEl) renderMcpBadge(badgeEl);
    });
}

function renderMcpBadge(el) {
  if (!el) return;
  if (mcpHealthCache === 'ok') {
    el.className = 'ai-status-pill ok';
    el.innerHTML = svgIcon('check-circle') + ' خادم Claude MCP نشط ومتصل بقاعدة البيانات';
  } else if (mcpHealthCache === 'err') {
    el.className = 'ai-status-pill warn';
    el.innerHTML = svgIcon('alert') + ' تعذّر الوصول المؤقت لخادم السحابة — تحقق من الإنترنت';
  } else {
    el.className = 'ai-status-pill';
    el.innerHTML = svgIcon('cloud') + ' جارٍ فحص خادم الذكاء الاصطناعي...';
  }
}

/* ============ اللوحة الرئيسية للذكاء الاصطناعي و Claude ============ */
function renderAiPanel(p) {
  p.innerHTML =
    '<div class="ai-head-row">' +
      '<div>' +
        '<h2>' + svgIcon('sparkles') + ' الذكاء الاصطناعي والربط مع Claude</h2>' +
        '<p class="hint" style="margin-bottom:0">أدر موقعك مباشرة من داخل تطبيق <b>Claude</b> عن بُعد، أو الصق رابط قائمة تشغيل يوتيوب هنا ليُقسَّم تلقائياً حسب المادة والوحدة والدرس.</p>' +
      '</div>' +
      '<div id="mcpLiveBadge" class="ai-status-pill"></div>' +
    '</div>' +

    '<div class="ai-subtabs" id="aiSubtabs">' +
      '<button type="button" class="ai-subtab' + (aiSubView === 'playlist' ? ' active' : '') + '" data-sub="playlist">' +
        svgIcon('youtube') + ' استيراد بلاي ليست يوتيوب ذكي</button>' +
      '<button type="button" class="ai-subtab' + (aiSubView === 'claude-mcp' ? ' active' : '') + '" data-sub="claude-mcp">' +
        svgIcon('bot') + ' الدخول من تطبيق Claude (الربط المباشر)</button>' +
      '<button type="button" class="ai-subtab' + (aiSubView === 'chat' ? ' active' : '') + '" data-sub="chat">' +
        svgIcon('wand') + ' مساعد الإدارة الذكي (دردشة)</button>' +
    '</div>' +

    '<div id="aiSubBody"></div>';

  var badgeEl = $('#mcpLiveBadge', p);
  renderMcpBadge(badgeEl);
  checkMcpServerHealth(badgeEl);

  $('#aiSubtabs', p).addEventListener('click', function (e) {
    var btn = e.target.closest('[data-sub]');
    if (!btn) return;
    aiSubView = btn.dataset.sub;
    $all('.ai-subtab', p).forEach(function (b) { b.classList.toggle('active', b === btn); });
    renderAiSubBody($('#aiSubBody', p));
  });

  renderAiSubBody($('#aiSubBody', p));
}

function renderAiSubBody(container) {
  if (!container) return;
  if (aiSubView === 'playlist') renderPlaylistImporterView(container);
  else if (aiSubView === 'claude-mcp') renderClaudeMcpSetupView(container);
  else renderAiChatView(container);
}

/* ============================================================
   1) مستورد قوائم تشغيل يوتيوب الذكي (المادة ← الوحدة ← الدرس)
   ============================================================ */
function renderPlaylistImporterView(box) {
  var f = aiDraftState.form;
  var sortedSubjects = data.subjects.slice().sort(byOrder);
  var hasClaudeKey = Boolean(getSavedClaudeApiKey());

  var subjOptionsHTML =
    '<option value="__auto__"' + (f.subjectChoice === '__auto__' ? ' selected' : '') + '>✨ اكتشاف تلقائي للمادة من عنوان القائمة والفيديوهات</option>' +
    sortedSubjects.map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '"' + (f.subjectChoice === s.id ? ' selected' : '') + '>' +
        escapeHtml(s.name) + '</option>';
    }).join('') +
    '<option value="__new__"' + (f.subjectChoice === '__new__' ? ' selected' : '') + '>+ إنشاء مادة جديدة باسم مخصص...</option>';

  box.innerHTML =
    '<div class="frm-card ai-hero-card">' +
      '<h3 class="sub-title" style="margin-top:0">' + svgIcon('youtube') + ' استيراد وتقسيم قائمة تشغيل يوتيوب (YouTube Playlist)</h3>' +
      '<p class="hint">الصق رابط أي قائمة تشغيل (أو فيديو) من يوتيوب؛ سيقوم النظام باستخراج جميع الفيديوهات، التعرف على المادة والوحدة، دمج أجزاء الدرس الواحد، وفصل فيديوهات التمارين وحلول البكالوريا تلقائياً لتراجعها قبل الحفظ.</p>' +

      '<div class="ai-form-grid">' +
        '<label class="field ai-col-full">' +
          '<span>' + svgIcon('link') + ' رابط قائمة تشغيل يوتيوب (Playlist URL)</span>' +
          '<input class="inp" id="ytPlaylistUrl" dir="ltr" placeholder="https://www.youtube.com/playlist?list=PL..." value="' + escapeHtml(f.url) + '">' +
        '</label>' +

        '<label class="field">' +
          '<span>' + svgIcon('book') + ' المادة الدراسية</span>' +
          '<select class="inp" id="ytSubjectSelect">' + subjOptionsHTML + '</select>' +
        '</label>' +

        '<label class="field" id="ytCustomSubjWrap"' + (f.subjectChoice === '__new__' ? '' : ' hidden') + '>' +
          '<span>اسم المادة الجديدة</span>' +
          '<input class="inp" id="ytCustomSubjInp" placeholder="مثال: العلوم الفيزيائية" value="' + escapeHtml(f.customSubjectName) + '">' +
        '</label>' +

        '<label class="field">' +
          '<span>' + svgIcon('layers') + ' الوحدة الدراسية</span>' +
          '<select class="inp" id="ytUnitSelect"></select>' +
        '</label>' +

        '<label class="field" id="ytCustomUnitWrap"' + (f.unitChoice === '__new__' ? '' : ' hidden') + '>' +
          '<span>عنوان الوحدة الجديدة</span>' +
          '<input class="inp" id="ytCustomUnitInp" placeholder="مثال: الوحدة 1 — أعمال نهاية السنة" value="' + escapeHtml(f.customUnitTitle) + '">' +
        '</label>' +

        '<label class="field">' +
          '<span>' + svgIcon('film') + ' طريقة تنظيم المحتوى</span>' +
          '<select class="inp" id="ytGroupMode">' +
            '<option value="smart"' + (f.groupingMode === 'smart' ? ' selected' : '') + '>تجميع ذكي للدروس (يدمج أجزاء الدرس ويفصل التمارين)</option>' +
            '<option value="per_video"' + (f.groupingMode === 'per_video' ? ' selected' : '') + '>كل فيديو في درس مستقل بالترتيب</option>' +
            '<option value="unit_exercises"' + (f.groupingMode === 'unit_exercises' ? ' selected' : '') + '>✏️ استيراد كل فيديو كتمرين مستقل في قسم «تمارين الوحدة»</option>' +
            '<option value="single_lesson"' + (f.groupingMode === 'single_lesson' ? ' selected' : '') + '>وضع كل الفيديوهات داخل درس واحد</option>' +
          '</select>' +
        '</label>' +

        '<label class="field ai-col-full">' +
          '<span>' + svgIcon('wand') + ' ملاحظات إضافية للذكاء الاصطناعي (اختياري)</span>' +
          '<input class="inp" id="ytAiNotes" placeholder="مثال: ضع أول 6 فيديوهات في وحدة المتتاليات والباقي في وحدة الدوال..." value="' + escapeHtml(f.instructions) + '">' +
        '</label>' +
      '</div>' +

      '<label class="remember" style="margin:8px 0 14px">' +
        '<input type="checkbox" id="ytSepEx"' + (f.separateExercises ? ' checked' : '') + '>' +
        'وضع فيديوهات «التمارين / التطبيقات / حلول البكالوريا» تلقائياً في بطاقات التمارين التابعة للدرس' +
      '</label>' +

      '<div class="frm-row" style="align-items:center">' +
        '<button type="button" class="btn btn-primary" id="ytAnalyzeBtn"' + (aiDraftState.loading ? ' disabled' : '') + '>' +
          (aiDraftState.loading
            ? '<span class="ai-inline-spin"></span> جارٍ سحب القائمة وتحليل الدروس...'
            : svgIcon('sparkles') + ' جلب القائمة وتقسيمها ذكياً') +
        '</button>' +
        (hasClaudeKey
          ? '<span class="badge on">' + svgIcon('bot') + ' مفتاح Claude API مفعّل للتقسيم العميق</span>'
          : '<span class="badge">' + svgIcon('check') + ' يعمل مجاناً بالمحلل الذكي المدمج (أو أضف مفتاح Claude من تبويب الدردشة)</span>') +
      '</div>' +
    '</div>' +

    '<div id="ytResultArea"></div>';

  var subjSel = $('#ytSubjectSelect', box);
  var unitSel = $('#ytUnitSelect', box);

  function refreshUnitDropdown() {
    var sc = subjSel.value;
    $('#ytCustomSubjWrap', box).hidden = (sc !== '__new__');
    var units = (sc !== '__auto__' && sc !== '__new__') ? unitsOf(data, sc) : [];
    if (f.unitChoice !== '__auto__' && f.unitChoice !== '__new__' && !units.some(function (u) { return u.id === f.unitChoice; })) {
      f.unitChoice = '__auto__';
    }
    unitSel.innerHTML =
      '<option value="__auto__"' + (f.unitChoice === '__auto__' ? ' selected' : '') + '>✨ تلقائي (حسب الوحدات داخل العناوين أو اسم القائمة)</option>' +
      units.map(function (u) {
        return '<option value="' + escapeHtml(u.id) + '"' + (f.unitChoice === u.id ? ' selected' : '') + '>' +
          escapeHtml(u.title) + '</option>';
      }).join('') +
      '<option value="__new__"' + (f.unitChoice === '__new__' ? ' selected' : '') + '>+ كتابة اسم وحدة محدد...</option>';
    $('#ytCustomUnitWrap', box).hidden = (unitSel.value !== '__new__');
  }

  refreshUnitDropdown();

  subjSel.addEventListener('change', function () {
    f.subjectChoice = this.value;
    refreshUnitDropdown();
  });
  unitSel.addEventListener('change', function () {
    f.unitChoice = this.value;
    $('#ytCustomUnitWrap', box).hidden = (this.value !== '__new__');
  });

  $('#ytAnalyzeBtn', box).addEventListener('click', function () {
    f.url = $('#ytPlaylistUrl', box).value.trim();
    f.subjectChoice = subjSel.value;
    f.customSubjectName = $('#ytCustomSubjInp', box).value.trim();
    f.unitChoice = unitSel.value;
    f.customUnitTitle = $('#ytCustomUnitInp', box).value.trim();
    f.groupingMode = $('#ytGroupMode', box).value;
    f.separateExercises = $('#ytSepEx', box).checked;
    f.instructions = $('#ytAiNotes', box).value.trim();

    if (!f.url) {
      toast('الصق رابط قائمة تشغيل يوتيوب أولاً', 'err');
      $('#ytPlaylistUrl', box).focus();
      return;
    }
    runPlaylistAnalysis(box);
  });

  renderPlaylistPlanPreview($('#ytResultArea', box));
}

function runPlaylistAnalysis(box) {
  var f = aiDraftState.form;
  var subjectParam = '';
  if (f.subjectChoice === '__new__') subjectParam = f.customSubjectName;
  else if (f.subjectChoice !== '__auto__') subjectParam = f.subjectChoice;

  var unitParam = '';
  if (f.unitChoice === '__new__') unitParam = f.customUnitTitle;
  else if (f.unitChoice !== '__auto__') unitParam = f.unitChoice;

  aiDraftState.loading = true;
  aiDraftState.lastResult = null;
  renderPlaylistImporterView(box);

  fetch(mcpFunctionBaseUrl() + '/api/ai-organize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_PASS
    },
    body: JSON.stringify({
      url: f.url,
      subjectId: subjectParam || undefined,
      unitId: unitParam || undefined,
      groupingMode: f.groupingMode,
      separateExercises: f.separateExercises,
      instructions: f.instructions || undefined,
      anthropicKey: getSavedClaudeApiKey() || undefined
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      aiDraftState.loading = false;
      if (!res || !res.ok) {
        throw new Error((res && res.error) || 'تعذّر تحليل قائمة التشغيل');
      }
      aiDraftState.playlist = res.playlist;
      aiDraftState.plan = prepareEditablePlan(res.plan);
      aiDraftState.mode = res.mode || 'smart';
      toast('تم جلب ' + res.playlist.video_count + ' فيديو وتقسيمها بنجاح!');
      renderPlaylistImporterView(box);
    })
    .catch(function (err) {
      aiDraftState.loading = false;
      toast(String((err && err.message) || err || 'فشل الاتصال بالخادم'), 'err');
      renderPlaylistImporterView(box);
    });
}

function prepareEditablePlan(plan) {
  var cloned = JSON.parse(JSON.stringify(plan || { subject: { name: '' }, units: [] }));
  (cloned.units || []).forEach(function (u) {
    (u.lessons || []).forEach(function (l) {
      l._enabled = true;
      var combined = [];
      (l.videos || []).forEach(function (v) {
        combined.push({ title: v.title, url: v.url, role: 'video', enabled: true });
      });
      (l.exercises || []).forEach(function (ex) {
        combined.push({ title: ex.title, url: ex.url, role: 'exercise', enabled: true });
      });
      l._items = combined;
    });
  });
  return cloned;
}

function buildFinalPlanFromEditable(edPlan) {
  return {
    subject: edPlan.subject,
    skip_duplicate_urls: true,
    units: (edPlan.units || []).map(function (u) {
      var lessons = (u.lessons || []).filter(function (l) { return l._enabled !== false && l.title.trim(); }).map(function (l) {
        var videos = [];
        var exercises = [];
        (l._items || []).forEach(function (it) {
          if (!it.enabled) return;
          if (it.role === 'exercise') {
            exercises.push({ title: it.title.trim() || l.title.trim(), url: it.url, exercise_type: 'video' });
          } else {
            videos.push({ title: it.title.trim() || l.title.trim(), url: it.url });
          }
        });
        return {
          id: l.id || undefined,
          title: l.title.trim(),
          item_type: l.item_type === 'exercise' ? 'exercise' : 'lesson',
          videos: videos,
          exercises: exercises
        };
      }).filter(function (l) { return l.videos.length > 0 || l.exercises.length > 0; });

      return {
        id: u.id || undefined,
        title: u.title.trim(),
        lessons: lessons
      };
    }).filter(function (u) { return u.title && u.lessons.length > 0; })
  };
}

function renderPlaylistPlanPreview(area) {
  if (!area) return;

  if (aiDraftState.lastResult) {
    var r = aiDraftState.lastResult;
    area.innerHTML =
      '<div class="frm-card ai-success-card">' +
        '<h3 class="sub-title" style="margin-top:0;color:var(--ok)">' + svgIcon('check-circle') + ' تمت إضافة القائمة إلى الموقع بنجاح!</h3>' +
        '<p class="hint" style="margin-bottom:12px">المادة: <b>' + escapeHtml(r.subject.name) + '</b> — ' +
          'تم إنشاء/تحديث <b>' + (r.stats.units_created + r.stats.units_reused) + '</b> وحدة، ' +
          'و<b>' + (r.stats.lessons_created + r.stats.lessons_reused) + '</b> درس، ' +
          'وإضافة <b>' + r.stats.videos_added + '</b> فيديو شرح + <b>' + r.stats.exercises_added + '</b> تمرين تطبيقي' +
          (r.stats.duplicates_skipped ? ' (وتخطي ' + r.stats.duplicates_skipped + ' رابط مكرر)' : '') + '.</p>' +
        '<div class="frm-row">' +
          '<button type="button" class="btn btn-primary" id="goOrganizerAfterAi">' + svgIcon('layers') + ' فتح منظّم المحتوى لمعاينة الدروس</button>' +
          '<a class="btn" target="_blank" href="subject.html?subject=' + encodeURIComponent(r.subject.id) + '">' + svgIcon('eye') + ' معاينة المادة في الموقع</a>' +
        '</div>' +
      '</div>';

    $('#goOrganizerAfterAi', area).addEventListener('click', function () {
      sel.subject = r.subject.id;
      goToAdminTab('organizer');
    });
    return;
  }

  var plan = aiDraftState.plan;
  var pl = aiDraftState.playlist;
  if (!plan || !pl) {
    area.innerHTML = '';
    return;
  }

  var sortedSubjects = data.subjects.slice().sort(byOrder);
  var matchedExistingSubj = plan.subject.id ? getSubject(data, plan.subject.id) : null;

  var totalLessons = 0, totalVids = 0, totalExs = 0;
  (plan.units || []).forEach(function (u) {
    (u.lessons || []).forEach(function (l) {
      if (l._enabled === false) return;
      totalLessons++;
      (l._items || []).forEach(function (it) {
        if (!it.enabled) return;
        if (it.role === 'exercise') totalExs++; else totalVids++;
      });
    });
  });

  var unitsHTML = (plan.units || []).map(function (u, uIdx) {
    var lessonsHTML = (u.lessons || []).map(function (l, lIdx) {
      var itemsHTML = (l._items || []).map(function (it, iIdx) {
        var isEx = it.role === 'exercise';
        return '<div class="ai-vid-row' + (it.enabled ? '' : ' muted') + '">' +
          '<input type="checkbox" data-act="toggle-item" data-u="' + uIdx + '" data-l="' + lIdx + '" data-i="' + iIdx + '"' + (it.enabled ? ' checked' : '') + '>' +
          '<button type="button" class="ai-role-chip ' + (isEx ? 'ex' : 'vid') + '" data-act="flip-role" data-u="' + uIdx + '" data-l="' + lIdx + '" data-i="' + iIdx + '" title="اضغط للتبديل بين فيديو درس وتمرين">' +
            (isEx ? svgIcon('pencil') + ' تمرين' : svgIcon('film') + ' فيديو درس') +
          '</button>' +
          '<input class="inp ai-item-inp" data-act="edit-item-title" data-u="' + uIdx + '" data-l="' + lIdx + '" data-i="' + iIdx + '" value="' + escapeHtml(it.title) + '">' +
          '<a class="btn btn-icon" href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener" title="معاينة في يوتيوب">' + svgIcon('external') + '</a>' +
        '</div>';
      }).join('');

      var isUnitEx = l.item_type === 'exercise';
      return '<div class="ai-lesson-card' + (l._enabled === false ? ' muted' : '') + '">' +
        '<div class="ai-lesson-head">' +
          '<input type="checkbox" data-act="toggle-lesson" data-u="' + uIdx + '" data-l="' + lIdx + '"' + (l._enabled !== false ? ' checked' : '') + '>' +
          '<span class="ai-num">' + (lIdx + 1) + '</span>' +
          '<button type="button" class="ai-role-chip ' + (isUnitEx ? 'ex' : 'vid') + '" data-act="flip-lesson-type" data-u="' + uIdx + '" data-l="' + lIdx + '" title="اضغط للتبديل بين قسم الدروس وقسم تمارين الوحدة">' +
            (isUnitEx ? svgIcon('pencil') + ' تمرين وحدة' : svgIcon('book-open') + ' درس') +
          '</button>' +
          '<input class="inp" data-act="edit-lesson-title" data-u="' + uIdx + '" data-l="' + lIdx + '" value="' + escapeHtml(l.title) + '" placeholder="' + (isUnitEx ? 'عنوان التمرين' : 'عنوان الدرس') + '">' +
        '</div>' +
        '<div class="ai-vid-list">' + itemsHTML + '</div>' +
      '</div>';
    }).join('');

    return '<div class="ai-unit-block">' +
      '<div class="ai-unit-head">' +
        svgIcon('layers') +
        '<span>الوحدة ' + (uIdx + 1) + ':</span>' +
        '<input class="inp" data-act="edit-unit-title" data-u="' + uIdx + '" value="' + escapeHtml(u.title) + '" placeholder="عنوان الوحدة">' +
        '<span class="badge' + (u.id ? ' on' : '') + '">' + (u.id ? 'تُدمج مع وحدة موجودة' : 'وحدة جديدة') + '</span>' +
      '</div>' +
      '<div class="ai-lessons-wrap">' + lessonsHTML + '</div>' +
    '</div>';
  }).join('');

  area.innerHTML =
    '<div class="frm-card ai-preview-shell">' +
      '<div class="ai-preview-top">' +
        '<div>' +
          '<h3 class="sub-title" style="margin:0">' + svgIcon('check-circle') + ' معاينة التقسيم المقترح قبل الإضافة</h3>' +
          '<div class="item-sub" style="margin-top:4px">' +
            'القائمة: <b>' + escapeHtml(pl.title) + '</b>' + (pl.author ? ' · القناة: ' + escapeHtml(pl.author) : '') +
            ' · التقسيم بواسطة: <b>' + (aiDraftState.mode === 'claude' ? 'Claude AI' : 'المنظّم الذكي المدمج') + '</b>' +
          '</div>' +
        '</div>' +
        '<div class="badges">' +
          '<span class="badge on">' + (plan.units || []).length + ' وحدات</span>' +
          '<span class="badge on">' + totalLessons + ' دروس</span>' +
          '<span class="badge on">' + totalVids + ' فيديو</span>' +
          '<span class="badge on">' + totalExs + ' تمرين</span>' +
        '</div>' +
      '</div>' +

      '<div class="ai-subj-bar">' +
        '<label class="field" style="margin:0;flex:1;min-width:220px">' +
          '<span>' + svgIcon('book') + ' المادة المستهدفة (يمكنك تغييرها هنا)</span>' +
          '<select class="inp" id="planSubjPicker">' +
            sortedSubjects.map(function (s) {
              return '<option value="' + escapeHtml(s.id) + '"' + (matchedExistingSubj && matchedExistingSubj.id === s.id ? ' selected' : '') + '>' +
                escapeHtml(s.name) + ' (مادة موجودة)</option>';
            }).join('') +
            '<option value="__create__"' + (!matchedExistingSubj ? ' selected' : '') + '>+ إنشاء مادة جديدة باسم: ' + escapeHtml(plan.subject.name || 'مادة جديدة') + '</option>' +
          '</select>' +
        '</label>' +
        '<label class="field" id="planNewSubjWrap" style="margin:0;flex:1;min-width:200px"' + (!matchedExistingSubj ? '' : ' hidden') + '>' +
          '<span>اسم المادة الجديدة</span>' +
          '<input class="inp" id="planNewSubjName" value="' + escapeHtml(plan.subject.name || '') + '">' +
        '</label>' +
      '</div>' +

      '<p class="hint" style="margin:10px 0">💡 يمكنك تعديل أي عنوان وحدة أو درس مباشرة، أو الضغط على شارة <b>«فيديو درس / تمرين»</b> لتحويل أي فيديو إلى تمرين أو العكس قبل الحفظ.</p>' +

      '<div id="aiPlanTree">' + unitsHTML + '</div>' +

      '<div class="frm-row ai-commit-bar">' +
        '<button type="button" class="btn btn-primary" id="commitPlanBtn"' + (aiDraftState.saving ? ' disabled' : '') + '>' +
          (aiDraftState.saving
            ? '<span class="ai-inline-spin"></span> جارٍ حفظ الوحدات والدروس في الموقع...'
            : svgIcon('check') + ' اعتماد وإضافة الكل إلى الموقع (' + (totalVids + totalExs) + ' عنصر)') +
        '</button>' +
        '<button type="button" class="btn btn-danger" id="discardPlanBtn"' + (aiDraftState.saving ? ' disabled' : '') + '>' +
          svgIcon('x') + ' إلغاء المسودة</button>' +
      '</div>' +
    '</div>';

  /* أحداث شريط المادة */
  var picker = $('#planSubjPicker', area);
  picker.addEventListener('change', function () {
    if (this.value === '__create__') {
      plan.subject.id = undefined;
      $('#planNewSubjWrap', area).hidden = false;
    } else {
      var sObj = getSubject(data, this.value);
      if (sObj) {
        plan.subject.id = sObj.id;
        plan.subject.name = sObj.name;
        plan.subject.icon = sObj.icon;
        plan.subject.color = sObj.color;
      }
      $('#planNewSubjWrap', area).hidden = true;
    }
  });
  var newSubjInp = $('#planNewSubjName', area);
  if (newSubjInp) {
    newSubjInp.addEventListener('input', function () {
      plan.subject.name = this.value;
    });
  }

  /* أحداث شجرة الوحدات والدروس */
  var tree = $('#aiPlanTree', area);
  tree.addEventListener('input', function (e) {
    var t = e.target;
    var act = t.dataset.act;
    var u = +t.dataset.u, l = +t.dataset.l, i = +t.dataset.i;
    if (act === 'edit-unit-title' && plan.units[u]) {
      plan.units[u].title = t.value;
      plan.units[u].id = undefined;
    } else if (act === 'edit-lesson-title' && plan.units[u] && plan.units[u].lessons[l]) {
      plan.units[u].lessons[l].title = t.value;
      plan.units[u].lessons[l].id = undefined;
    } else if (act === 'edit-item-title' && plan.units[u] && plan.units[u].lessons[l]) {
      plan.units[u].lessons[l]._items[i].title = t.value;
    }
  });

  tree.addEventListener('change', function (e) {
    var t = e.target;
    var act = t.dataset.act;
    var u = +t.dataset.u, l = +t.dataset.l, i = +t.dataset.i;
    if (act === 'toggle-lesson' && plan.units[u] && plan.units[u].lessons[l]) {
      plan.units[u].lessons[l]._enabled = t.checked;
      renderPlaylistPlanPreview(area);
    } else if (act === 'toggle-item' && plan.units[u] && plan.units[u].lessons[l]) {
      plan.units[u].lessons[l]._items[i].enabled = t.checked;
      renderPlaylistPlanPreview(area);
    }
  });

  tree.addEventListener('click', function (e) {
    var lessonTypeBtn = e.target.closest('[data-act="flip-lesson-type"]');
    if (lessonTypeBtn) {
      var lu = +lessonTypeBtn.dataset.u, ll = +lessonTypeBtn.dataset.l;
      var lObj = plan.units[lu] && plan.units[lu].lessons[ll];
      if (lObj) {
        lObj.item_type = lObj.item_type === 'exercise' ? 'lesson' : 'exercise';
        renderPlaylistPlanPreview(area);
      }
      return;
    }
    var btn = e.target.closest('[data-act="flip-role"]');
    if (!btn) return;
    var u = +btn.dataset.u, l = +btn.dataset.l, i = +btn.dataset.i;
    var item = plan.units[u].lessons[l]._items[i];
    item.role = item.role === 'exercise' ? 'video' : 'exercise';
    renderPlaylistPlanPreview(area);
  });

  $('#discardPlanBtn', area).addEventListener('click', function () {
    aiDraftState.plan = null;
    aiDraftState.playlist = null;
    renderPlaylistPlanPreview(area);
  });

  $('#commitPlanBtn', area).addEventListener('click', function () {
    commitPlanToSite(area);
  });
}

function commitPlanToSite(area) {
  var finalPlan = buildFinalPlanFromEditable(aiDraftState.plan);
  if (!finalPlan.subject || !finalPlan.subject.name || !finalPlan.units.length) {
    toast('لا توجد دروس مفعّلة للإضافة', 'err');
    return;
  }

  aiDraftState.saving = true;
  renderPlaylistPlanPreview(area);

  /* في الوضع السحابي: ننفذ الإضافة الذرية عبر خادم MCP ثم نحدّث البيانات محلياً */
  if (isCloudMode()) {
    fetch(mcpFunctionBaseUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_PASS
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'apply_curriculum_plan',
          arguments: finalPlan
        }
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (rpcRes) {
        if (rpcRes.error) throw new Error(rpcRes.error.message);
        if (rpcRes.result && rpcRes.result.isError) {
          throw new Error(rpcRes.result.content && rpcRes.result.content[0] ? rpcRes.result.content[0].text : 'فشل الحفظ');
        }
        var parsed = JSON.parse(rpcRes.result.content[0].text);
        return Cloud.loadAll().then(function (freshData) {
          data = freshData;
          window.CLOUD_DATA = freshData;
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData)); } catch (e) { /* تجاهل */ }
          return parsed;
        });
      })
      .then(function (summary) {
        aiDraftState.saving = false;
        aiDraftState.plan = null;
        aiDraftState.playlist = null;
        aiDraftState.lastResult = summary;
        toast('تمت إضافة القائمة ومزامنتها في السحابة بنجاح!');
        renderPlaylistPlanPreview(area);
      })
      .catch(function (err) {
        aiDraftState.saving = false;
        toast(String((err && err.message) || err), 'err');
        renderPlaylistPlanPreview(area);
      });
    return;
  }

  /* احتياط الوضع المحلي (بدون سحابة) */
  var localSummary = applyPlanLocally(finalPlan);
  aiDraftState.saving = false;
  aiDraftState.plan = null;
  aiDraftState.playlist = null;
  aiDraftState.lastResult = localSummary;
  toast('تمت الإضافة محلياً بنجاح');
  renderPlaylistPlanPreview(area);
}

function applyPlanLocally(finalPlan) {
  var subj = (finalPlan.subject.id && getSubject(data, finalPlan.subject.id)) ||
    data.subjects.find(function (s) { return normArClient(s.name) === normArClient(finalPlan.subject.name); });
  var createdSubj = false;
  if (!subj) {
    subj = {
      id: uid('s'),
      name: finalPlan.subject.name.trim(),
      icon: finalPlan.subject.icon || 'book',
      color: finalPlan.subject.color || 'indigo',
      order: data.subjects.length + 1
    };
    data.subjects.push(subj);
    createdSubj = true;
  }

  var stats = {
    units_created: 0, units_reused: 0,
    lessons_created: 0, lessons_reused: 0,
    videos_added: 0, exercises_added: 0, duplicates_skipped: 0
  };

  finalPlan.units.forEach(function (uP) {
    var existingU = unitsOf(data, subj.id).find(function (u) {
      return (uP.id && u.id === uP.id) || normArClient(u.title) === normArClient(uP.title);
    });
    if (!existingU) {
      existingU = { id: uid('u'), subjectId: subj.id, title: uP.title, order: unitsOf(data, subj.id).length + 1 };
      data.units.push(existingU);
      stats.units_created++;
    } else {
      stats.units_reused++;
    }

    uP.lessons.forEach(function (lP) {
      var isExItem = lP.item_type === 'exercise';
      var pool = isExItem ? unitExercisesOf(data, existingU.id) : lessonsOf(data, existingU.id);
      var existingL = pool.find(function (l) {
        return (lP.id && l.id === lP.id) || normArClient(l.title) === normArClient(lP.title);
      });
      if (!existingL) {
        existingL = {
          id: uid(isExItem ? 'ex' : 'l'),
          unitId: existingU.id,
          title: lP.title,
          itemType: isExItem ? 'exercise' : 'lesson',
          order: pool.length + 1
        };
        data.lessons.push(existingL);
        stats.lessons_created++;
      } else {
        stats.lessons_reused++;
      }

      var lessonUrls = new Set(resourcesOf(data, existingL.id).map(function (r) { return r.url; }));
      (lP.videos || []).forEach(function (v) {
        if (lessonUrls.has(v.url)) { stats.duplicates_skipped++; return; }
        lessonUrls.add(v.url);
        data.resources.push({
          id: uid('r'), lessonId: existingL.id, kind: 'video',
          title: v.title, url: v.url, order: resourcesOf(data, existingL.id, 'video').length + 1
        });
        stats.videos_added++;
      });
      (lP.exercises || []).forEach(function (ex) {
        if (lessonUrls.has(ex.url)) { stats.duplicates_skipped++; return; }
        lessonUrls.add(ex.url);
        data.resources.push({
          id: uid('r'), lessonId: existingL.id, kind: 'exercise',
          title: ex.title, url: ex.url, exerciseType: 'video',
          order: resourcesOf(data, existingL.id, 'exercise').length + 1
        });
        stats.exercises_added++;
      });
    });
  });

  save();
  return { ok: true, subject: { id: subj.id, name: subj.name, created: createdSubj }, stats: stats };
}

/* ============================================================
   2) لوحة الربط المباشر مع تطبيق Claude (Remote MCP)
   ============================================================ */
function renderClaudeMcpSetupView(box) {
  var mcpUrl = buildClaudeMcpConnectorUrl();
  var desktopJson = JSON.stringify({
    mcpServers: {
      'aya-bac-2027': {
        command: 'npx',
        args: ['-y', 'mcp-remote', mcpUrl]
      }
    }
  }, null, 2);

  var samplePrompts = [
    'اعرض لي جميع المواد والوحدات والدروس الموجودة حالياً في موقع آية باك 2027 مع الإحصائيات.',
    'خذ رابط قائمة تشغيل يوتيوب هذه، استخرج فيديوهاتها وقسّمها بذكاء حسب المادة والوحدة والدرس (مع وضع التمارين في قسم التمارين) وأضفها للموقع:\nhttps://www.youtube.com/playlist?list=PUT_PLAYLIST_HERE',
    'أنشئ وحدة جديدة في مادة المحاسبة بعنوان «أعمال نهاية السنة» وأضف بداخلها درس «التثبيتات العينية والمعنوية».'
  ];

  box.innerHTML =
    '<div class="frm-card ai-hero-card">' +
      '<h3 class="sub-title" style="margin-top:0">' + svgIcon('bot') + ' الدخول من تطبيق Claude لإدارة الموقع عن بُعد (Remote MCP)</h3>' +
      '<p class="hint">تم نشر خادم ذكي خاص بموقعك على سحابة Supabase ببروتوكول <b>Model Context Protocol (MCP)</b>. بمجرد ربط هذا الرابط في حسابك على <b>Claude</b> (بدون الحاجة لأي مفتاح مدفوع إضافي)، يصبح بإمكان Claude قراءة وتعديل المواد والوحدات والدروس واستقبال روابط قوائم تشغيل يوتيوب وإضافتها للموقع مباشرة من محادثتك معه!</p>' +

      '<label class="field">' +
        '<span>' + svgIcon('key') + ' رابط الموصّل السحابي الخاص بك لـ Claude (يحمل مفتاح الإدارة المشفّر — لا تشاركه مع غيرك)</span>' +
        '<div class="ai-secret-row">' +
          '<input class="inp" id="mcpSecretUrlInp" type="password" readonly dir="ltr" value="' + escapeHtml(mcpUrl) + '">' +
          '<button type="button" class="btn" id="toggleMcpUrlBtn">' + svgIcon('eye') + ' إظهار</button>' +
          '<button type="button" class="btn btn-primary" id="copyMcpUrlBtn">' + svgIcon('copy') + ' نسخ الرابط لـ Claude</button>' +
        '</div>' +
      '</label>' +

      '<div class="ai-steps-grid">' +
        '<div class="ai-step-card">' +
          '<div class="ai-step-badge">الطريقة 1 — عبر موقع وتطبيق Claude.ai</div>' +
          '<ol class="ai-steps-list">' +
            '<li>افتح <b>claude.ai</b> من المتصفح ثم ادخل إلى <b>Settings (الإعدادات)</b> ← <b>Connectors (الموصّلات)</b>.</li>' +
            '<li>اضغط على <b>Add custom connector</b> (إضافة موصّل مخصص).</li>' +
            '<li>في خانة الاسم اكتب: <code>آية باك 2027</code>، وفي خانة <b>Remote MCP Server URL</b> الصق الرابط المنسوخ أعلاه ثم اضغط <b>Add</b>.</li>' +
            '<li>افتح أي محادثة جديدة في Claude (على الكمبيوتر أو تطبيق الهاتف)، فعّل موصّل <b>آية باك 2027</b> من قائمة الأدوات، وأرسل له أي رابط بلاي ليست يوتيوب!</li>' +
          '</ol>' +
        '</div>' +

        '<div class="ai-step-card">' +
          '<div class="ai-step-badge">الطريقة 2 — عبر برنامج Claude Desktop للكمبيوتر</div>' +
          '<p class="hint" style="margin-bottom:8px">إذا كنت تستعمل برنامج سطح المكتب المجاني <b>Claude Desktop</b>، الصق هذا الإعداد داخل ملف <code>claude_desktop_config.json</code> (من القائمة: Settings ← Developer ← Edit Config):</p>' +
          '<pre class="ai-code-box" dir="ltr">' + escapeHtml(desktopJson) + '</pre>' +
          '<button type="button" class="btn btn-sm" id="copyDesktopCfgBtn">' + svgIcon('copy') + ' نسخ إعداد Claude Desktop</button>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="frm-card">' +
      '<h3 class="sub-title" style="margin-top:0">' + svgIcon('sparkles') + ' رسائل جاهزة للإرسال إلى Claude بعد الربط (اضغط للنسخ)</h3>' +
      '<div class="ai-prompts-list">' +
        samplePrompts.map(function (pr, idx) {
          return '<button type="button" class="ai-prompt-card" data-prompt-idx="' + idx + '">' +
            '<span class="ai-prompt-txt">' + escapeHtml(pr) + '</span>' +
            '<span class="badge on">' + svgIcon('copy') + ' نسخ الأمر</span>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</div>';

  var inp = $('#mcpSecretUrlInp', box);
  $('#toggleMcpUrlBtn', box).addEventListener('click', function () {
    var hidden = inp.type === 'password';
    inp.type = hidden ? 'text' : 'password';
    this.innerHTML = (hidden ? svgIcon('eye-off') + ' إخفاء' : svgIcon('eye') + ' إظهار');
  });

  $('#copyMcpUrlBtn', box).addEventListener('click', function () {
    copyTextToClipboard(mcpUrl, 'تم نسخ رابط الربط مع Claude');
  });

  $('#copyDesktopCfgBtn', box).addEventListener('click', function () {
    copyTextToClipboard(desktopJson, 'تم نسخ ملف إعداد Claude Desktop');
  });

  box.addEventListener('click', function (e) {
    var card = e.target.closest('[data-prompt-idx]');
    if (!card) return;
    var pText = samplePrompts[+card.dataset.promptIdx];
    copyTextToClipboard(pText, 'تم نسخ الأمر — الصقه في محادثة Claude');
  });
}

/* ============================================================
   3) مساعد الدردشة الذكي المباشر داخل لوحة التحكم
   ============================================================ */
function renderAiChatView(box) {
  var savedKey = getSavedClaudeApiKey();

  box.innerHTML =
    '<div class="frm-card">' +
      '<div class="ai-chat-top">' +
        '<div>' +
          '<h3 class="sub-title" style="margin:0">' + svgIcon('wand') + ' مساعد الإدارة الذكي داخل اللوحة</h3>' +
          '<p class="hint" style="margin:4px 0 0">أرسل رابط قائمة تشغيل يوتيوب أو اطلب إحصائيات الموقع مباشرة، أو أضف مفتاح Claude API اختيارياً لتفعيل محادثة Claude الكاملة داخل هذه الصفحة.</p>' +
        '</div>' +
        '<button type="button" class="btn btn-sm" id="toggleKeyCfgBtn">' +
          svgIcon('key') + (savedKey ? ' مفتاح Claude API مفعّل' : ' إعداد مفتاح Claude API (اختياري)') +
        '</button>' +
      '</div>' +

      '<div id="claudeKeyDrawer" class="ai-key-drawer" hidden>' +
        '<label class="field" style="margin-bottom:8px">' +
          '<span>مفتاح Anthropic Claude API (يُحفظ في متصفحك هذا فقط ولا يُرفع إلى GitHub)</span>' +
          '<div class="ai-secret-row">' +
            '<input class="inp" id="claudeApiKeyInp" type="password" dir="ltr" placeholder="sk-ant-api03-..." value="' + escapeHtml(savedKey) + '">' +
            '<button type="button" class="btn btn-primary" id="saveClaudeKeyBtn">' + svgIcon('save') + ' حفظ المفتاح</button>' +
            (savedKey ? '<button type="button" class="btn btn-danger" id="clearClaudeKeyBtn">' + svgIcon('trash') + ' حذف</button>' : '') +
          '</div>' +
        '</label>' +
      '</div>' +

      '<div class="ai-chat-log" id="aiChatLog"></div>' +

      '<form class="ai-chat-form" id="aiChatForm">' +
        '<input class="inp" id="aiChatInp" placeholder="اكتب أمرك أو الصق رابط بلاي ليست يوتيوب... (مثال: أضف https://youtube.com/playlist?list=... في الرياضيات)" autocomplete="off">' +
        '<button type="submit" class="btn btn-primary" id="aiChatSendBtn">' + svgIcon('send') + ' إرسال</button>' +
      '</form>' +
    '</div>';

  $('#toggleKeyCfgBtn', box).addEventListener('click', function () {
    var d = $('#claudeKeyDrawer', box);
    d.hidden = !d.hidden;
  });

  $('#saveClaudeKeyBtn', box).addEventListener('click', function () {
    var val = $('#claudeApiKeyInp', box).value.trim();
    setSavedClaudeApiKey(val);
    toast(val ? 'تم حفظ مفتاح Claude API في متصفحك' : 'تمت إزالة المفتاح');
    renderAiChatView(box);
  });

  var clrBtn = $('#clearClaudeKeyBtn', box);
  if (clrBtn) {
    clrBtn.addEventListener('click', function () {
      setSavedClaudeApiKey('');
      toast('تم حذف المفتاح من المتصفح', 'info');
      renderAiChatView(box);
    });
  }

  function renderMessages() {
    var logEl = $('#aiChatLog', box);
    if (!logEl) return;
    logEl.innerHTML = aiChatHistory.map(function (m) {
      return '<div class="ai-msg ' + (m.role === 'user' ? 'user' : 'bot') + '">' +
        '<div class="ai-msg-avatar">' + svgIcon(m.role === 'user' ? 'cap' : 'bot') + '</div>' +
        '<div class="ai-msg-bubble">' + escapeHtml(m.content).replace(/\n/g, '<br>') + '</div>' +
      '</div>';
    }).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  renderMessages();

  $('#aiChatForm', box).addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = $('#aiChatInp', box);
    var sendBtn = $('#aiChatSendBtn', box);
    var text = inp.value.trim();
    if (!text) return;

    inp.value = '';
    aiChatHistory.push({ role: 'user', content: text });
    renderMessages();

    var apiKey = getSavedClaudeApiKey();

    /* الوضع 1: إذا كان مفتاح Claude API موجوداً → وكيل Claude الكامل مع الأدوات */
    if (apiKey) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="ai-inline-spin"></span> يُفكّر...';

      fetch(mcpFunctionBaseUrl() + '/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': ADMIN_PASS
        },
        body: JSON.stringify({
          anthropicKey: apiKey,
          messages: aiChatHistory
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok) throw new Error((res && res.error) || 'خطأ في المحادثة');
          aiChatHistory.push({ role: 'assistant', content: res.reply || 'تم التنفيذ بنجاح.' });
          if (res.mutated && isCloudMode()) {
            return Cloud.loadAll().then(function (fresh) {
              data = fresh;
              window.CLOUD_DATA = fresh;
              toast('قام Claude بتحديث محتوى الموقع في السحابة');
            });
          }
        })
        .catch(function (err) {
          aiChatHistory.push({ role: 'assistant', content: '⚠️ تعذّر التنفيذ: ' + String((err && err.message) || err) });
        })
        .finally(function () {
          sendBtn.disabled = false;
          sendBtn.innerHTML = svgIcon('send') + ' إرسال';
          renderMessages();
        });
      return;
    }

    /* الوضع 2 (بدون مفتاح API): التقاط روابط يوتيوب وتوجيهها للمحلل الذكي فوراً أو الرد على الأوامر المحلية */
    var urlMatch = text.match(/https?:\/\/[^\s]+/i);
    if (urlMatch && /youtube\.com|youtu\.be/i.test(urlMatch[0])) {
      var extractedUrl = urlMatch[0];
      /* محاولة التقاط اسم المادة المذكورة في الرسالة */
      var matchedSubj = data.subjects.find(function (s) {
        var sn = normArClient(s.name).replace(/^ال/, '');
        return sn.length >= 3 && normArClient(text).indexOf(sn) !== -1;
      });
      aiDraftState.form.url = extractedUrl;
      aiDraftState.form.subjectChoice = matchedSubj ? matchedSubj.id : '__auto__';
      aiDraftState.form.instructions = text;

      aiChatHistory.push({
        role: 'assistant',
        content: '✨ تم التقاط رابط يوتيوب' + (matchedSubj ? ' وتحديد مادة «' + matchedSubj.name + '»' : '') +
          '! جارٍ فتح مستورد القوائم الذكي وسحب الفيديوهات لتقسيمها حسب المادة والوحدة والدرس...'
      });
      renderMessages();

      setTimeout(function () {
        aiSubView = 'playlist';
        var parentPanel = $('#panel');
        renderAiPanel(parentPanel);
        runPlaylistAnalysis($('#aiSubBody', parentPanel));
      }, 450);
      return;
    }

    /* ردود ذكية سريعة عن حالة الموقع بدون مفتاح */
    if (/احصائ|كم عدد|مواد|هيكل|محتو/.test(normArClient(text))) {
      var summaryLines = data.subjects.slice().sort(byOrder).map(function (s) {
        var uList = unitsOf(data, s.id);
        var lCount = uList.reduce(function (n, u) { return n + lessonsOf(data, u.id).length; }, 0);
        return '• ' + s.name + ': ' + uList.length + ' وحدات، ' + lCount + ' دروس';
      }).join('\n');
      aiChatHistory.push({
        role: 'assistant',
        content: '📊 إحصائيات موقع آية باك 2027 الحالية:\n' +
          'إجمالي المواد: ' + data.subjects.length + ' | الوحدات: ' + data.units.length +
          ' | الدروس: ' + data.lessons.length + ' | الموارد: ' + data.resources.length + '\n\n' + summaryLines
      });
      renderMessages();
      return;
    }

    aiChatHistory.push({
      role: 'assistant',
      content: '💡 يمكنك هنا:\n' +
        '1) لصق أي رابط قائمة تشغيل يوتيوب مباشرة (مثال: أضف https://www.youtube.com/playlist?list=... في المحاسبة) وسيتم تقسيمها تلقائياً ومجاناً.\n' +
        '2) أو فتح قسم «الدخول من تطبيق Claude» أعلاه لنسخ رابط MCP وربطه بحسابك في Claude.ai لإدارة الموقع بحرية تامة.\n' +
        '3) أو الضغط على زر «إعداد مفتاح Claude API» أعلى المحادثة لتفعيل الدردشة الحرة المباشرة هنا.'
    });
    renderMessages();
  });
}
