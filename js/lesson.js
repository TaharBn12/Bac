/* ============================================================
   آية باك 2027 — صفحة الدرس: مشغل الفيديو + الملفات + التمارين
   ============================================================ */
'use strict';

/* ============ مشغل فيديو مخصص (يدعم الملفات المرفوعة والروابط المباشرة ويوتيوب) ============ */
function AyaPlayer(shell) {
  this.shell = shell;
  this.current = null;      /* { title, url } */
  this.idleTimer = null;

  shell.innerHTML =
    '<div class="player" id="vpBox">' +
      '<div class="player-loading" id="vpLoading"><div class="spinner"></div></div>' +
    '</div>';

  this.box = $('#vpBox', shell);
  this.buildControls();
  this.bindEvents();
}

AyaPlayer.prototype.buildControls = function () {
  var html =
    '<video id="vpVideo" playsinline preload="metadata"></video>' +

    '<div class="vp-center" id="vpCenter">' +
      '<button class="vp-bigplay" id="vpBigPlay" aria-label="تشغيل">' + svgIcon('play') + '</button>' +
    '</div>' +
    '<div class="vp-now" id="vpNow"></div>' +

    '<div class="vp-controls" id="vpControls">' +
      '<div class="vp-progress">' +
        '<input type="range" class="vp-range" id="vpSeek" min="0" max="1000" value="0" step="1" aria-label="شريط التقدم">' +
      '</div>' +
      '<div class="vp-row">' +
        '<button class="vp-btn" id="vpPlay" title="تشغيل / إيقاف">' + svgIcon('play') + '</button>' +
        '<button class="vp-btn" id="vpBack" title="إرجاع 10 ثوان">' + svgIcon('rewind') + '</button>' +
        '<button class="vp-btn" id="vpFwd" title="تقديم 10 ثوان">' + svgIcon('forward') + '</button>' +
        '<span class="vp-time" id="vpTime">0:00 / 0:00</span>' +
        '<span class="vp-spacer"></span>' +
        '<span class="vp-vol">' +
          '<button class="vp-btn" id="vpMute" title="كتم الصوت">' + svgIcon('volume-high') + '</button>' +
          '<input type="range" class="vp-range" id="vpVol" min="0" max="1" step="0.05" value="1" aria-label="مستوى الصوت">' +
        '</span>' +
        '<select class="vp-speed" id="vpSpeed" title="سرعة التشغيل">' +
          '<option value="0.5">0.5x</option><option value="0.75">0.75x</option>' +
          '<option value="1" selected>1x</option><option value="1.25">1.25x</option>' +
          '<option value="1.5">1.5x</option><option value="2">2x</option>' +
        '</select>' +
        (document.pictureInPictureEnabled ? '<button class="vp-btn" id="vpPip" title="نافذة عائمة">' + svgIcon('pip') + '</button>' : '') +
        '<a class="vp-btn vp-dl" id="vpDl" title="تنزيل الفيديو" download hidden>' + svgIcon('download') + '</a>' +
        '<button class="vp-btn" id="vpFs" title="ملء الشاشة">' + svgIcon('fullscreen') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="player-error" id="vpError" hidden></div>' +
    '<div class="player-loading" id="vpLoading"><div class="spinner"></div></div>';

  this.box.innerHTML = html;

  this.video    = $('#vpVideo', this.box);
  this.center   = $('#vpCenter', this.box);
  this.bigPlay  = $('#vpBigPlay', this.box);
  this.nowLbl   = $('#vpNow', this.box);
  this.controls = $('#vpControls', this.box);
  this.seek     = $('#vpSeek', this.box);
  this.timeLbl  = $('#vpTime', this.box);
  this.playBtn  = $('#vpPlay', this.box);
  this.muteBtn  = $('#vpMute', this.box);
  this.volRange = $('#vpVol', this.box);
  this.speedSel = $('#vpSpeed', this.box);
  this.dlBtn    = $('#vpDl', this.box);
  this.errorBox = $('#vpError', this.box);
};

AyaPlayer.prototype.bindEvents = function () {
  var self = this;

  /* تشغيل / إيقاف */
  function toggle() { if (self.video.paused || self.video.ended) self.video.play(); else self.video.pause(); }

  this.center.addEventListener('click', function () { self.video.play(); });
  this.video.addEventListener('click', toggle);
  this.video.addEventListener('dblclick', function () { self.toggleFs(); });
  this.playBtn.addEventListener('click', toggle);
  this.bigPlay.addEventListener('click', function (e) { e.stopPropagation(); self.video.play(); });

  /* تقديم / إرجاع */
  $('#vpBack', this.box).addEventListener('click', function () { self.video.currentTime = Math.max(0, self.video.currentTime - 10); });
  $('#vpFwd', this.box).addEventListener('click', function () {
    self.video.currentTime = Math.min(self.video.duration || 0, self.video.currentTime + 10);
  });

  /* شريط التقدم */
  this.seek.addEventListener('pointerdown', function () { self.seekingDrag = true; });
  this.seek.addEventListener('input', function () {
    if (self.video.duration) self.video.currentTime = (this.value / 1000) * self.video.duration;
  });
  this.seek.addEventListener('change', function () { self.seekingDrag = false; });

  /* الصوت */
  this.volRange.addEventListener('input', function () {
    self.video.volume = +this.value;
    self.video.muted = (+this.value === 0);
  });
  this.muteBtn.addEventListener('click', function () {
    self.video.muted = !self.video.muted;
    self.volRange.value = self.video.muted ? 0 : self.video.volume;
    self.updateVolIcon();
  });
  this.video.addEventListener('volumechange', function () { self.updateVolIcon(); });

  /* السرعة */
  this.speedSel.addEventListener('change', function () { self.video.playbackRate = +this.value; });

  /* ملء الشاشة والنافذة العائمة */
  $('#vpFs', this.box).addEventListener('click', function () { self.toggleFs(); });
  var pip = $('#vpPip', this.box);
  if (pip) pip.addEventListener('click', function () {
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else self.video.requestPictureInPicture();
  });

  /* أحداث الفيديو */
  this.video.addEventListener('loadedmetadata', function () { self.updateTime(); });
  this.video.addEventListener('timeupdate', function () {
    if (!self.seekingDrag && self.video.duration) {
      self.seek.value = Math.round((self.video.currentTime / self.video.duration) * 1000);
    }
    self.updateTime();
  });
  this.video.addEventListener('play', function () {
    self.playBtn.innerHTML = svgIcon('pause');
    self.center.style.display = 'none';
    self.scheduleIdle();
  });
  this.video.addEventListener('pause', function () {
    self.playBtn.innerHTML = svgIcon('play');
    self.center.style.display = '';
    self.wake();
  });
  this.video.addEventListener('ended', function () { self.playBtn.innerHTML = svgIcon('play'); self.wake(); });
  this.video.addEventListener('error', function () {
    if (!self.video.src) return;
    self.showError('تعذّر تشغيل الفيديو',
      'قد تكون صيغة الملف غير مدعومة من المتصفح أو الرابط غير متاح.<br>' +
      'الصيغ الموصى بها: <b>MP4</b> و WebM و OGG، أو استعمل رابط يوتيوب.');
  });

  /* إخفاء عناصر التحكم عند الخمول */
  this.box.addEventListener('mousemove', function () { self.wake(); });
  this.box.addEventListener('touchstart', function () { self.wake(); }, { passive: true });

  /* لوحة المفاتيح */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (!self.video.src) return;
    switch (e.key) {
      case ' ': case 'k': e.preventDefault(); toggle(); break;
      case 'ArrowRight': e.preventDefault(); self.video.currentTime += 10; break;
      case 'ArrowLeft':  e.preventDefault(); self.video.currentTime -= 10; break;
      case 'ArrowUp':    e.preventDefault(); self.video.volume = Math.min(1, self.video.volume + 0.1); break;
      case 'ArrowDown':  e.preventDefault(); self.video.volume = Math.max(0, self.video.volume - 0.1); break;
      case 'm': self.video.muted = !self.video.muted; break;
      case 'f': self.toggleFs(); break;
    }
    self.wake();
  });
};

AyaPlayer.prototype.seekingDrag = false;

AyaPlayer.prototype.updateTime = function () {
  var d = this.video.duration || 0;
  this.timeLbl.textContent = fmtTime(this.video.currentTime) + ' / ' + fmtTime(d);
};

AyaPlayer.prototype.updateVolIcon = function () {
  var n = (this.video.muted || this.video.volume === 0) ? 'volume-mute' : (this.video.volume < 0.5 ? 'volume-low' : 'volume-high');
  this.muteBtn.innerHTML = svgIcon(n);
};

AyaPlayer.prototype.wake = function () {
  this.box.classList.remove('idle');
  clearTimeout(this.idleTimer);
  this.scheduleIdle();
};

AyaPlayer.prototype.scheduleIdle = function () {
  var self = this;
  clearTimeout(this.idleTimer);
  if (this.video.paused) return;
  this.idleTimer = setTimeout(function () {
    if (!self.video.paused && !self.box.matches(':hover')) self.box.classList.add('idle');
  }, 2600);
};

AyaPlayer.prototype.toggleFs = function () {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (this.box.requestFullscreen) this.box.requestFullscreen();
};

AyaPlayer.prototype.showLoading = function (on) {
  var el = $('#vpLoading', this.box);
  if (el) el.style.display = on ? '' : 'none';
};

AyaPlayer.prototype.showError = function (title, msg) {
  this.showLoading(false);
  this.errorBox.hidden = false;
  this.errorBox.innerHTML = '<div><b>' + svgIcon('alert') + ' ' + escapeHtml(title) + '</b>' + msg + '</div>';
  this.controls.style.display = 'none';
  this.center.style.display = 'none';
};

/* تحميل عنصر: { title, url } */
AyaPlayer.prototype.load = function (item) {
  var self = this;
  this.current = item;
  this.showLoading(true);
  this.errorBox.hidden = true;
  this.controls.style.display = '';
  this.center.style.display = '';

  resolveSrc(item.url).then(function (res) {
    self.showLoading(false);

    if (res.kind === 'error') {
      self.showError('الملف غير متوفر', escapeHtml(res.message || ''));
      return;
    }

    /* رابط يوتيوب → مشغل يوتيوب المدمج */
    if (res.kind === 'youtube') {
      self.toYoutubeMode(res.id, item.title);
      return;
    }

    /* ملف / رابط مباشر → مشغلنا المخصص */
    self.box.querySelectorAll('iframe').forEach(function (f) { f.remove(); });
    self.video.style.display = '';
    self.video.src = res.src;
    self.nowLbl.textContent = item.title || '';
    self.dlBtn.hidden = false;
    self.dlBtn.href = res.src;
    self.dlBtn.setAttribute('download', res.fileName || 'video');
  }).catch(function () {
    self.showError('خطأ غير متوقع', 'تعذّر تحميل الفيديو.');
  });
};

AyaPlayer.prototype.toYoutubeMode = function (ytId, title) {
  /* نستبدل المحتوى بمشغل يوتيوب */
  this.video.removeAttribute('src');
  this.video.style.display = 'none';
  this.controls.style.display = 'none';
  this.center.style.display = 'none';
  this.nowLbl.textContent = '';
  this.dlBtn.hidden = true;

  var old = this.box.querySelector('iframe');
  if (old) old.remove();

  var ifr = document.createElement('iframe');
  ifr.src = 'https://www.youtube.com/embed/' + ytId + '?rel=0&autoplay=1';
  ifr.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
  ifr.allowFullscreen = true;
  ifr.title = title || 'فيديو يوتيوب';
  this.box.insertBefore(ifr, this.box.firstChild);
};

/* ============ بناء صفحة الدرس / التمرين ============ */
function initLessonPage() {
  requireAuth();
  hydrateIcons();
  var data = loadData();

  var lesson = getLesson(data, param('lesson'));
  if (!lesson) { location.replace('home.html'); return; }

  var isExPage = typeof isExerciseItem === 'function' && isExerciseItem(lesson);
  var path = lessonPath(data, lesson.id);
  var subject = path.subject || { id: '', name: 'مادة', color: '', icon: 'book' };
  var unit = path.unit || { id: '', title: 'وحدة' };

  document.title = 'آية باك 2027 — ' + lesson.title;

  /* مسار التنقل + العنوان */
  var unitBaseHref = 'unit.html?unit=' + encodeURIComponent(unit.id);
  $('#crumbs').innerHTML = breadcrumb([
    { label: 'الرئيسية', href: 'home.html', icon: 'home' },
    { label: subject.name, href: 'subject.html?subject=' + encodeURIComponent(subject.id) },
    { label: unit.title, href: unitBaseHref },
    { label: isExPage ? 'التمارين' : 'الدروس', href: unitBaseHref + '&section=' + (isExPage ? 'exercises' : 'lessons') },
    { label: lesson.title }
  ]);
  $('#lessonTitle').innerHTML =
    (isExPage ? svgIcon('pencil') : iconHTML(subject.icon, 'film')) + ' ' + escapeHtml(lesson.title);

  /* زر إكمال الدرس أو التمرين (يتزامن مع استعمال الزمن الأسبوعي ويتحول للأخضر) */
  var completeBar = $('#lessonCompleteBar');
  function renderCompleteButton() {
    if (!completeBar || typeof isItemCompleted !== 'function') return;
    var done = isItemCompleted(lesson.id);
    var noun = isExPage ? 'التمرين' : 'الدرس';
    completeBar.innerHTML =
      '<button type="button" class="btn-complete-item' + (done ? ' is-completed' : '') + '" id="completeItemBtn">' +
        svgIcon(done ? 'check-circle' : 'check') +
        '<span>' + (done ? ('مكتمل ✓ — تم إنهاء هذا ' + noun) : ('إكمال ' + noun)) + '</span>' +
      '</button>' +
      '<a class="btn btn-sm" href="schedule.html" title="فتح استعمال الزمن الأسبوعي">' +
        svgIcon('calendar') + '<span>استعمال الزمن</span>' +
      '</a>';
    $('#completeItemBtn').addEventListener('click', function () {
      var nowDone = toggleItemCompleted(lesson.id);
      renderCompleteButton();
      if (nowDone) {
        toast('أحسنت! تم تحديد ' + noun + ' كمكتمل باللون الأخضر في استعمال الزمن ولن يتكرر الأسبوع القادم');
      } else {
        toast('تم إلغاء علامة الإكمال عن هذا ' + noun, 'info');
      }
    });
  }
  renderCompleteButton();

  var vidSection = $('#videoSection');
  var pdfSection = $('#pdfSection');
  var imgSection = $('#imgSection');
  var exSection  = $('#exSection');

  if (isExPage) {
    var vidH2 = $('#videoSection > h2');
    if (vidH2) vidH2.innerHTML = svgIcon('film') + ' فيديوهات حل التمرين';
    var pdfH2 = $('#pdfSection > h2');
    if (pdfH2) pdfH2.innerHTML = svgIcon('file') + ' ملفات التمرين والحل PDF';
    var imgH2 = $('#imgSection > h2');
    if (imgH2) imgH2.innerHTML = svgIcon('image') + ' صور التمرين والحل';
    var emptyEl = $('#emptyAll');
    if (emptyEl) emptyEl.textContent = 'هذا التمرين لا يحتوي على محتوى بعد';

    /* في صفحة التمرين المستقل نضع الصور والـ PDF في الأعلى قبل الفيديو */
    if (vidSection && vidSection.parentNode) {
      if (imgSection) vidSection.parentNode.insertBefore(imgSection, vidSection);
      if (pdfSection) vidSection.parentNode.insertBefore(pdfSection, vidSection);
    }
  }

  var videos = resourcesOf(data, lesson.id, 'video');
  var pdfs   = resourcesOf(data, lesson.id, 'pdf');
  var images = resourcesOf(data, lesson.id, 'image');
  var exs    = resourcesOf(data, lesson.id, 'exercise');

  var player = null;
  var shellEl = $('#playerShell');
  var tabsEl = $('#videoTabs');

  function openSectionAccordion(secEl) {
    if (!secEl) return;
    secEl.style.display = '';
    secEl.classList.add('is-open');
    secEl.classList.remove('is-collapsed');
    var body = secEl.querySelector('.lesson-sec-content');
    if (body) body.hidden = false;
    var tBtn = secEl.querySelector('.sec-acc-toggle');
    if (tBtn) {
      tBtn.setAttribute('aria-expanded', 'true');
      var lbl = tBtn.querySelector('.sec-acc-lbl');
      if (lbl) lbl.textContent = 'إخفاء';
    }
  }

  function ensurePlayer() {
    if (vidSection) openSectionAccordion(vidSection);
    shellEl.hidden = false;
    if (!player) player = new AyaPlayer(shellEl);
    return player;
  }

  /* ---- الفيديوهات (مع دعم المجموعات الديناميكية: عنوان + فيديو أو عدة فيديوهات) ---- */
  if (videos.length) {
    ensurePlayer();
    var vGroups = typeof groupResources === 'function' ? groupResources(videos) : [{ isExplicit: false, title: '', items: videos }];
    var showGroupedVideos = vGroups.some(function (g) { return g.isExplicit && g.items.length > 1; }) ||
      (vGroups.length > 1 && vGroups.some(function (g) { return g.isExplicit; }));

    if (showGroupedVideos) {
      tabsEl.classList.add('video-tabs-grouped');
      var flatVidIdx = 0;
      tabsEl.innerHTML = vGroups.map(function (vg, gIdx) {
        var gTitle = vg.title || ('الفقرة ' + (gIdx + 1));
        var btns = vg.items.map(function (v, subIdx) {
          var curIdx = flatVidIdx++;
          var lbl = vg.items.length > 1
            ? ('الجزء ' + (subIdx + 1) + (v.title && v.title !== gTitle && v.title !== (gTitle + ' (' + (subIdx + 1) + ')') ? ' — ' + v.title : ''))
            : (v.title || gTitle || 'تشغيل الفيديو');
          return '<button class="vtab' + (curIdx === 0 ? ' active' : '') + '" data-i="' + curIdx + '">' +
            svgIcon('play') + ' ' + escapeHtml(lbl) + '</button>';
        }).join('');
        return '<div class="video-group-block">' +
          '<div class="video-group-title"><span class="vg-num">' + (gIdx + 1) + '</span>' + escapeHtml(gTitle) +
            (vg.items.length > 1 ? ' <small>(' + vg.items.length + ' فيديوهات)</small>' : '') +
          '</div>' +
          '<div class="video-group-btns">' + btns + '</div>' +
        '</div>';
      }).join('');
    } else {
      tabsEl.classList.remove('video-tabs-grouped');
      tabsEl.innerHTML = videos.map(function (v, i) {
        return '<button class="vtab' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">' +
          escapeHtml((i + 1) + '. ' + (v.groupTitle || v.title || 'فيديو')) + '</button>';
      }).join('');
    }

    tabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.vtab');
      if (!btn) return;
      $all('.vtab', tabsEl).forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      ensurePlayer().load(videos[+btn.dataset.i]);
      shellEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    player.load(videos[0]);
  } else {
    /* إخفاء قسم الفيديو إذا لم يكن فيه فيديوهات (ويُعاد إظهاره تلقائياً إذا شغل الطالب تمرين فيديو) */
    shellEl.hidden = true;
    tabsEl.hidden = true;
    if (vidSection) vidSection.style.display = 'none';
  }

  /* ---- ملفات PDF (مع دعم العناوين الديناميكية وملف أو عدة ملفات تحت كل عنوان) ---- */
  var pdfEl = $('#pdfGrid');
  if (pdfs.length) {
    var pdfKindLabel = isExPage ? 'ملف التمرين PDF' : 'ملخص PDF';
    var pdfGroups = typeof groupResources === 'function' ? groupResources(pdfs) : [{ isExplicit: false, title: '', items: pdfs }];
    var showGroupedPdfs = pdfGroups.some(function (g) { return g.items.length > 1; }) ||
      (pdfGroups.length > 1 && pdfGroups.some(function (g) { return g.isExplicit; }));

    function hydratePdfSlot(slotEl, p, fallbackTitle) {
      resolveSrc(p.url).then(function (res) {
        if (res.kind === 'error') { slotEl.remove(); return; }
        var summaryName = p.title || fallbackTitle || res.fileName || pdfKindLabel;
        slotEl.className = 'pdf-card';
        slotEl.innerHTML =
          '<div class="pdf-ico">' + svgIcon('file') + '</div>' +
          '<div class="pdf-copy"><div class="t" title="' + escapeHtml(summaryName) + '">' + escapeHtml(summaryName) + '</div>' +
            '<span class="pdf-kind">' + pdfKindLabel + '</span></div>' +
          '<div class="acts" aria-label="خيارات الملف">' +
            '<a class="btn btn-icon" target="_blank" rel="noopener" href="' + escapeHtml(res.src) + '" title="مشاهدة الملف" aria-label="مشاهدة ' + escapeHtml(summaryName) + '">' + svgIcon('eye') + '</a>' +
            '<a class="btn btn-icon" download="' + escapeHtml(res.fileName || summaryName + '.pdf') + '" href="' + escapeHtml(res.src) + '" title="تنزيل الملف" aria-label="تنزيل ' + escapeHtml(summaryName) + '">' + svgIcon('download') + '</a>' +
          '</div>';
      });
    }

    if (showGroupedPdfs) {
      pdfEl.className = 'media-groups-stack';
      pdfGroups.forEach(function (pg, gIdx) {
        var gTitle = pg.title || (pdfKindLabel + ' ' + (gIdx + 1));
        var gCard = document.createElement('div');
        gCard.className = 'media-group-card';
        gCard.innerHTML =
          '<div class="media-group-head">' +
            '<div class="media-group-title"><span class="mg-num">' + (gIdx + 1) + '</span><h3>' + escapeHtml(gTitle) + '</h3></div>' +
            (pg.items.length > 1 ? '<span class="badge on">' + svgIcon('file') + ' ' + pg.items.length + ' ملفات PDF</span>' : '') +
          '</div>' +
          '<div class="pdf-grid"></div>';
        var innerGrid = gCard.querySelector('.pdf-grid');
        pg.items.forEach(function (p, subIdx) {
          var slot = document.createElement('article');
          slot.className = 'pdf-card pdf-card-loading';
          innerGrid.appendChild(slot);
          var dispTitle = pg.items.length > 1
            ? (p.title && p.title !== gTitle ? p.title : (gTitle + ' — ملف ' + (subIdx + 1)))
            : gTitle;
          hydratePdfSlot(slot, p, dispTitle);
        });
        pdfEl.appendChild(gCard);
      });
    } else {
      pdfs.forEach(function (p) {
        var slot = document.createElement('article');
        slot.className = 'pdf-card pdf-card-loading';
        pdfEl.appendChild(slot);
        hydratePdfSlot(slot, p, p.groupTitle || p.title);
      });
    }
  } else {
    $('#pdfSection').style.display = 'none';
  }

  /* ---- عارض الصور الموحّد (يدعم التنقل بين صور المعرض أو صور أي تمرين متعدد الصور) ---- */
  var galEl = $('#imgGallery');
  var lb = $('#lightbox');
  var lbImg = $('#lbImg'), lbCap = $('#lbCap');
  var activeLightboxItems = [];
  var lightboxBound = false;

  function bindLightboxControls() {
    if (lightboxBound) return;
    lightboxBound = true;
    $('#lbClose').addEventListener('click', function () { lb.classList.remove('open'); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.classList.remove('open'); });
    $('#lbPrev').addEventListener('click', function (e) {
      e.stopPropagation();
      var valid = activeLightboxItems.filter(Boolean);
      if (valid.length <= 1) return;
      var i = (+lb.dataset.i - 1 + valid.length) % valid.length;
      showLightboxIndex(valid, i);
    });
    $('#lbNext').addEventListener('click', function (e) {
      e.stopPropagation();
      var valid = activeLightboxItems.filter(Boolean);
      if (valid.length <= 1) return;
      var i = (+lb.dataset.i + 1) % valid.length;
      showLightboxIndex(valid, i);
    });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') lb.classList.remove('open');
      if (e.key === 'ArrowLeft') $('#lbPrev').click();
      if (e.key === 'ArrowRight') $('#lbNext').click();
    });
  }

  function showLightboxIndex(validList, idx) {
    if (!validList[idx]) return;
    bindLightboxControls();
    activeLightboxItems = validList;
    lbImg.src = validList[idx].src;
    lbCap.textContent = validList[idx].title || '';
    lb.dataset.i = String(idx);
    $('#lbPrev').hidden = validList.length <= 1;
    $('#lbNext').hidden = validList.length <= 1;
    lb.classList.add('open');
  }

  function openLightboxForSlot(slotsArray, targetSlotIdx) {
    var valid = [];
    var mappedIndex = 0;
    slotsArray.forEach(function (entry, sIdx) {
      if (entry && entry.src) {
        if (sIdx === targetSlotIdx) mappedIndex = valid.length;
        valid.push(entry);
      }
    });
    if (valid.length) showLightboxIndex(valid, mappedIndex);
  }

  /* ---- الصور (مع دعم الفقرات الديناميكية: عنوان + صورة أو عدة صور، ثم عنوان + صورة أو عدة صور...) ---- */
  if (images.length) {
    var imgGroups = typeof groupResources === 'function' ? groupResources(images) : [{ isExplicit: false, title: '', items: images }];
    var mainImageSlots = new Array(images.length);
    var defaultStackMode = isExPage;

    /* شريط تبديل طريقة عرض الصور (صفحات كبيرة متتابعة واضحة للحلول أو شبكة مصغّرة) داخل جسم القسم */
    var imgSecContent = $('#imgSection .lesson-sec-content');
    if (imgSecContent) {
      var modeSwitchBar = document.createElement('div');
      modeSwitchBar.className = 'sec-subtools-bar';
      var modeSwitch = document.createElement('div');
      modeSwitch.className = 'img-mode-switch';
      modeSwitch.innerHTML =
        '<button type="button" class="img-mode-btn' + (defaultStackMode ? ' active' : '') + '" data-imode="stack">' +
          svgIcon('layers') + ' صفحات واضحة</button>' +
        '<button type="button" class="img-mode-btn' + (!defaultStackMode ? ' active' : '') + '" data-imode="grid">' +
          svgIcon('image') + ' شبكة</button>';
      modeSwitchBar.appendChild(modeSwitch);
      imgSecContent.insertBefore(modeSwitchBar, galEl);

      modeSwitch.addEventListener('click', function (e) {
        var b = e.target.closest('[data-imode]');
        if (!b) return;
        var isStack = b.dataset.imode === 'stack';
        $all('.img-mode-btn', modeSwitch).forEach(function (x) { x.classList.toggle('active', x === b); });
        galEl.classList.toggle('img-view-stack', isStack);
      });
    }

    galEl.className = 'media-groups-stack' + (defaultStackMode ? ' img-view-stack' : '');
    var globalImgCursor = 0;

    imgGroups.forEach(function (ig, gIdx) {
      var gTitle = ig.title || (isExPage ? 'فقرة الصور ' + (gIdx + 1) : 'صورة ' + (gIdx + 1));
      var gCard = document.createElement('div');
      gCard.className = 'media-group-card';
      gCard.innerHTML =
        '<div class="media-group-head">' +
          '<div class="media-group-title"><span class="mg-num">' + (gIdx + 1) + '</span><h3>' + escapeHtml(gTitle) + '</h3></div>' +
          '<span class="badge' + (ig.items.length > 1 ? ' on' : '') + '">' + svgIcon('image') + ' ' +
            (ig.items.length === 1 ? 'صورة واحدة' : (ig.items.length === 2 ? 'صورتان' : ig.items.length + ' صور')) +
          '</span>' +
        '</div>' +
        '<div class="img-gallery"></div>';

      var innerGal = gCard.querySelector('.img-gallery');

      ig.items.forEach(function (img, subIdx) {
        var slotIdx = globalImgCursor++;
        var stepText = ig.items.length > 1 ? ('صورة ' + (subIdx + 1) + ' من ' + ig.items.length) : '';
        var lbCaption = gTitle + (stepText ? ' — ' + stepText : '');

        var thumb = document.createElement('div');
        thumb.className = 'img-thumb';
        thumb.innerHTML =
          (ig.items.length > 1 ? '<span class="img-step-badge">' + (subIdx + 1) + ' / ' + ig.items.length + '</span>' : '') +
          '<img alt="' + escapeHtml(lbCaption) + '" loading="lazy">' +
          '<div class="cap">' + escapeHtml(stepText || gTitle) + '</div>';
        innerGal.appendChild(thumb);

        resolveSrc(img.url).then(function (res) {
          if (res.kind === 'error') { thumb.remove(); return; }
          mainImageSlots[slotIdx] = { src: res.src, title: lbCaption };
          var im = thumb.querySelector('img');
          im.onerror = function () {
            im.style.display = 'none';
            thumb.style.background = 'linear-gradient(135deg, #7c5cff33, #f5c54222)';
            thumb.style.display = 'grid'; thumb.style.placeItems = 'center';
            thumb.insertAdjacentHTML('afterbegin', svgIcon('image'));
            thumb.querySelector('.ic').style.cssText = 'width:34px;height:34px;opacity:.55';
          };
          im.src = res.src;
          thumb.addEventListener('click', function () {
            openLightboxForSlot(mainImageSlots, slotIdx);
          });
        });
      });

      galEl.appendChild(gCard);
    });
  } else {
    $('#imgSection').style.display = 'none';
  }

  /* ---- التمارين المرفقة بالدرس (مع دعم عنوان + صورة أو عدة صور / فيديو / PDF) ---- */
  var exEl = $('#exBtns');
  if (exs.length) {
    var exGroups = typeof groupResources === 'function' ? groupResources(exs) : exs.map(function (x) { return { isExplicit: false, title: x.title, exerciseType: x.exerciseType, items: [x] }; });
    var hasImageExGroups = exGroups.some(function (g) {
      return (g.exerciseType || (g.items[0] && g.items[0].exerciseType)) === 'image';
    });
    var hasCardExGroups = hasImageExGroups || exGroups.some(function (g) { return g.items.length > 1; });
    if (hasCardExGroups) exEl.classList.add('ex-groups-mixed');

    /* شريط أدوات قسم التمارين داخل جسم القسم (تظهر عند فتح قسم التمارين) */
    var exSecContent = $('#exSection .lesson-sec-content');
    var standaloneUnitExs = (!isExPage && typeof unitExercisesOf === 'function' && unit) ? unitExercisesOf(data, unit.id) : [];
    if (exSecContent && (hasImageExGroups || standaloneUnitExs.length)) {
      var exHeadTools = document.createElement('div');
      exHeadTools.className = 'sec-subtools-bar';

      if (standaloneUnitExs.length) {
        var unitExLink = document.createElement('a');
        unitExLink.className = 'btn btn-sm';
        unitExLink.href = 'unit.html?unit=' + encodeURIComponent(unit.id) + '&section=exercises';
        unitExLink.innerHTML = svgIcon('pencil') + ' صفحة تمارين الوحدة (' + standaloneUnitExs.length + ')';
        exHeadTools.appendChild(unitExLink);
      }

      if (hasImageExGroups) {
        var exDefaultStack = true;
        exEl.classList.toggle('img-view-stack', exDefaultStack);
        var exModeSwitch = document.createElement('div');
        exModeSwitch.className = 'img-mode-switch';
        exModeSwitch.innerHTML =
          '<button type="button" class="img-mode-btn' + (exDefaultStack ? ' active' : '') + '" data-imode="stack">' +
            svgIcon('layers') + ' صفحات واضحة</button>' +
          '<button type="button" class="img-mode-btn' + (!exDefaultStack ? ' active' : '') + '" data-imode="grid">' +
            svgIcon('image') + ' شبكة</button>';
        exModeSwitch.addEventListener('click', function (e) {
          var b = e.target.closest('[data-imode]');
          if (!b) return;
          var isStack = b.dataset.imode === 'stack';
          $all('.img-mode-btn', exModeSwitch).forEach(function (x) { x.classList.toggle('active', x === b); });
          exEl.classList.toggle('img-view-stack', isStack);
        });
        exHeadTools.appendChild(exModeSwitch);
      }

      exSecContent.insertBefore(exHeadTools, exEl);
    }

    exGroups.forEach(function (eg, gIdx) {
      var type = eg.exerciseType || (eg.items[0] && eg.items[0].exerciseType) || 'link';
      var gTitle = eg.title || (eg.items[0] && eg.items[0].title) || ('تمرين ' + (gIdx + 1));

      /* حالة تمرين مصوّر (صورة واحدة أو عدة صور متتالية تحت نفس العنوان الديناميكي) */
      if (type === 'image') {
        var exImgSlots = new Array(eg.items.length);
        var exCard = document.createElement('div');
        exCard.className = 'media-group-card ex-inline-group';
        exCard.innerHTML =
          '<div class="media-group-head">' +
            '<div class="media-group-title"><span class="mg-num">' + (gIdx + 1) + '</span><h3>' + escapeHtml(gTitle) + '</h3></div>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<span class="badge on">' + svgIcon('image') + ' ' +
                (eg.items.length === 1 ? 'صورة واحدة' : (eg.items.length === 2 ? 'صورتان' : eg.items.length + ' صور')) +
              '</span>' +
              '<button type="button" class="btn btn-sm ex-open-gal-btn">' + svgIcon('eye') + ' عرض مكبّر</button>' +
            '</div>' +
          '</div>' +
          '<div class="img-gallery"></div>';

        var exGal = exCard.querySelector('.img-gallery');
        eg.items.forEach(function (exItem, sIdx) {
          var stepLbl = eg.items.length > 1 ? ('صورة ' + (sIdx + 1) + ' من ' + eg.items.length) : gTitle;
          var capTxt = gTitle + (eg.items.length > 1 ? ' — ' + stepLbl : '');
          var th = document.createElement('div');
          th.className = 'img-thumb';
          th.innerHTML =
            (eg.items.length > 1 ? '<span class="img-step-badge">' + (sIdx + 1) + ' / ' + eg.items.length + '</span>' : '') +
            '<img alt="' + escapeHtml(capTxt) + '" loading="lazy">' +
            '<div class="cap">' + escapeHtml(stepLbl) + '</div>';
          exGal.appendChild(th);

          resolveSrc(exItem.url).then(function (res) {
            if (res.kind === 'error') { th.remove(); return; }
            exImgSlots[sIdx] = { src: res.src, title: capTxt };
            var im = th.querySelector('img');
            im.src = res.src;
            th.addEventListener('click', function () {
              openLightboxForSlot(exImgSlots, sIdx);
            });
          });
        });

        exCard.querySelector('.ex-open-gal-btn').addEventListener('click', function () {
          openLightboxForSlot(exImgSlots, 0);
        });

        exEl.appendChild(exCard);
        return;
      }

      /* دالة إنشاء زر تمرين مفرد */
      function makeExBtn(ex, customLabel) {
        var itemType = ex.exerciseType || type || 'link';
        var btn = document.createElement('button');
        var exerciseTitle = customLabel || ex.title || gTitle || 'تمرين';
        btn.type = 'button';
        btn.className = 'ex-btn ex-' + itemType;
        btn.setAttribute('aria-label', 'فتح ' + exerciseTitle);
        var ico = svgIcon(itemType === 'video' ? 'film' : (itemType === 'pdf' ? 'file' : (itemType === 'image' ? 'image' : 'link')));
        var kindLbl = itemType === 'video' ? 'فيديو تطبيقي'
          : (itemType === 'pdf' ? 'تمرين PDF' : (itemType === 'image' ? 'تمرين مصوّر' : 'رابط تطبيقي'));
        btn.innerHTML = '<span class="ex-icon">' + ico + '</span>' +
          '<span class="ex-copy"><strong>' + escapeHtml(exerciseTitle) + '</strong><small>' + kindLbl + '</small></span>' +
          '<span class="ex-go" aria-hidden="true">' + svgIcon('chevron-left') + '</span>';
        btn.addEventListener('click', function () {
          if (itemType === 'video') {
            var p = ensurePlayer();
            p.load({ title: exerciseTitle, url: ex.url });
            $all('.vtab', tabsEl).forEach(function (t) { t.classList.remove('active'); });
            shellEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (itemType === 'image') {
            resolveSrc(ex.url).then(function (res) {
              if (res.kind === 'error') { toast(res.message, 'err'); return; }
              showLightboxIndex([{ src: res.src, title: exerciseTitle }], 0);
            });
          } else {
            resolveSrc(ex.url).then(function (res) {
              if (res.kind === 'error') { toast(res.message, 'err'); return; }
              if (res.kind === 'youtube') { window.open('https://www.youtube.com/watch?v=' + res.id, '_blank'); return; }
              window.open(res.src, '_blank');
            });
          }
        });
        return btn;
      }

      if (eg.items.length > 1) {
        var multiCard = document.createElement('div');
        multiCard.className = 'media-group-card ex-inline-group';
        multiCard.innerHTML =
          '<div class="media-group-head">' +
            '<div class="media-group-title"><span class="mg-num">' + (gIdx + 1) + '</span><h3>' + escapeHtml(gTitle) + '</h3></div>' +
            '<span class="badge on">' + eg.items.length + ' عناصر</span>' +
          '</div>' +
          '<div class="ex-btns"></div>';
        var innerBtns = multiCard.querySelector('.ex-btns');
        eg.items.forEach(function (exItem, sIdx) {
          var subLbl = (exItem.title && exItem.title !== gTitle) ? exItem.title : (gTitle + ' (' + (sIdx + 1) + ')');
          innerBtns.appendChild(makeExBtn(exItem, subLbl));
        });
        exEl.appendChild(multiCard);
      } else {
        exEl.appendChild(makeExBtn(eg.items[0], gTitle));
      }
    });
  } else {
    $('#exSection').style.display = 'none';
  }

  /* ---- تفعيل الطي الذكي للأقسام والمجموعات (فتح القسم/العنوان الأول فقط وإغلاق البقية بزر سهم) ---- */
  function setupCollapsibleGroupsInSection(secEl) {
    var cards = $all('.media-group-card', secEl);
    if (cards.length <= 1) return;

    var secBody = secEl.querySelector('.lesson-sec-content');
    if (secBody) {
      var subBar = secBody.querySelector('.sec-subtools-bar');
      if (!subBar) {
        subBar = document.createElement('div');
        subBar.className = 'sec-subtools-bar';
        secBody.insertBefore(subBar, secBody.firstChild);
      }
      var toggleAllBtn = document.createElement('button');
      toggleAllBtn.type = 'button';
      toggleAllBtn.className = 'btn btn-sm';
      var allExpanded = false;
      function syncToggleAllLbl() {
        toggleAllBtn.innerHTML = svgIcon(allExpanded ? 'chevron-up' : 'chevron-down') +
          ' ' + (allExpanded ? 'طي العناوين الفرعية' : 'فتح كل العناوين (' + cards.length + ')');
      }
      syncToggleAllLbl();
      toggleAllBtn.addEventListener('click', function () {
        allExpanded = !allExpanded;
        cards.forEach(function (c, idx) {
          var open = allExpanded ? true : (idx === 0);
          setGroupCardOpen(c, open);
        });
        syncToggleAllLbl();
      });
      subBar.appendChild(toggleAllBtn);
    }

    function setGroupCardOpen(card, open) {
      card.classList.toggle('is-open', open);
      card.classList.toggle('is-collapsed', !open);
      Array.prototype.forEach.call(card.children, function (ch) {
        if (!ch.classList.contains('media-group-head')) ch.hidden = !open;
      });
      var arrBtn = card.querySelector('.mg-acc-btn');
      if (arrBtn) {
        arrBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        var sp = arrBtn.querySelector('span');
        if (sp) sp.textContent = open ? 'إخفاء' : 'إظهار المحتوى';
      }
    }

    cards.forEach(function (card, idx) {
      var head = card.querySelector('.media-group-head');
      if (!head) return;
      head.style.cursor = 'pointer';
      var arrBtn = document.createElement('button');
      arrBtn.type = 'button';
      arrBtn.className = 'btn-acc-arrow mg-acc-btn';
      arrBtn.innerHTML = '<span>' + (idx === 0 ? 'إخفاء' : 'إظهار المحتوى') + '</span>' + svgIcon('chevron-down');
      head.appendChild(arrBtn);

      setGroupCardOpen(card, idx === 0);

      head.addEventListener('click', function (e) {
        if (e.target.closest('.ex-open-gal-btn')) return;
        var nextOpen = card.classList.contains('is-collapsed');
        setGroupCardOpen(card, nextOpen);
      });
    });
  }

  var sectionCounts = {
    videoSection: videos.length ? (videos.length + ' فيديو') : '',
    pdfSection:   pdfs.length ? (pdfs.length + ' ملف') : '',
    imgSection:   images.length ? (groupResources(images).length + ' عنوان · ' + images.length + ' صورة') : '',
    exSection:    exs.length ? (groupResources(exs).length + ' عنوان · ' + exs.length + ' عنصر') : ''
  };

  var visibleSections = $all('.lesson-wrap > .lesson-section').filter(function (sec) {
    return sec.style.display !== 'none';
  });

  visibleSections.forEach(function (sec, idx) {
    setupCollapsibleGroupsInSection(sec);
    var h2 = sec.querySelector(':scope > h2');
    var body = sec.querySelector(':scope > .lesson-sec-content');
    if (!h2 || !body) return;

    var toggleBar = document.createElement('button');
    toggleBar.type = 'button';
    toggleBar.className = 'sec-acc-toggle';
    var countTxt = sectionCounts[sec.id] || '';
    var isFirst = (idx === 0);

    toggleBar.setAttribute('aria-expanded', isFirst ? 'true' : 'false');
    toggleBar.innerHTML =
      '<span class="sec-acc-title">' + h2.innerHTML +
        (countTxt ? ' <span class="sec-acc-cnt">' + escapeHtml(countTxt) + '</span>' : '') +
      '</span>' +
      '<span class="sec-acc-arrow">' +
        '<span class="sec-acc-lbl">' + (isFirst ? 'إخفاء' : 'إظهار المحتوى') + '</span>' +
        '<span class="acc-chevron">' + svgIcon('chevron-down') + '</span>' +
      '</span>';

    sec.insertBefore(toggleBar, h2);
    h2.remove();

    sec.classList.toggle('is-open', isFirst);
    sec.classList.toggle('is-collapsed', !isFirst);
    body.hidden = !isFirst;

    toggleBar.addEventListener('click', function () {
      var nowOpen = body.hidden;
      body.hidden = !nowOpen;
      sec.classList.toggle('is-open', nowOpen);
      sec.classList.toggle('is-collapsed', !nowOpen);
      toggleBar.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
      var lbl = toggleBar.querySelector('.sec-acc-lbl');
      if (lbl) lbl.textContent = nowOpen ? 'إخفاء' : 'إظهار المحتوى';
    });
  });

  /* إذا كان الدرس أو التمرين فارغاً تماماً نعرض تنبيه الفراغ */
  if (!videos.length && !pdfs.length && !images.length && !exs.length) {
    $('#emptyAll').hidden = false;
  }

  $('#logoutBtn').addEventListener('click', doLogout);
}
