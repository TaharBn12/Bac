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

/* ============ بناء صفحة الدرس ============ */
function initLessonPage() {
  requireAuth();
  hydrateIcons();
  var data = loadData();

  var lesson = getLesson(data, param('lesson'));
  if (!lesson) { location.replace('home.html'); return; }

  var path = lessonPath(data, lesson.id);
  var subject = path.subject || { name: 'مادة', color: '', icon: 'book' };
  var unit = path.unit || { title: 'وحدة' };

  /* مسار التنقل + العنوان */
  $('#crumbs').innerHTML = breadcrumb([
    { label: 'الرئيسية', href: 'home.html', icon: 'home' },
    { label: subject.name, href: 'subject.html?subject=' + encodeURIComponent(subject.id) },
    { label: unit.title, href: 'unit.html?unit=' + encodeURIComponent(unit.id) },
    { label: lesson.title }
  ]);
  $('#lessonTitle').innerHTML = iconHTML(subject.icon, 'film') + ' ' + escapeHtml(lesson.title);

  var player = new AyaPlayer($('#playerShell'));

  /* ---- الفيديوهات ---- */
  var videos = resourcesOf(data, lesson.id, 'video');
  var tabsEl = $('#videoTabs');

  if (videos.length) {
    tabsEl.innerHTML = videos.map(function (v, i) {
      return '<button class="vtab' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">' +
        escapeHtml((i + 1) + '. ' + (v.title || 'فيديو')) + '</button>';
    }).join('');

    tabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.vtab');
      if (!btn) return;
      $all('.vtab', tabsEl).forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      player.load(videos[+btn.dataset.i]);
      $('#playerShell').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    player.load(videos[0]);
  } else {
    $('#playerShell').innerHTML =
      '<div class="player"><div class="player-error" style="position:relative;display:grid">' +
      '<div>' + svgIcon('film') + ' لا توجد فيديوهات في هذا الدرس بعد</div>' +
      '</div></div>';
  }

  /* ---- ملفات PDF ---- */
  var pdfs = resourcesOf(data, lesson.id, 'pdf');
  var pdfEl = $('#pdfGrid');
  if (pdfs.length) {
    pdfs.forEach(function (p) {
      resolveSrc(p.url).then(function (res) {
        if (res.kind === 'error') return;
        var card = document.createElement('article');
        var summaryName = p.title || res.fileName || 'ملخص PDF';
        card.className = 'pdf-card';
        /* لا نعرض الرابط إطلاقاً: الاسم الذي يضعه المدير هو النص الوحيد الظاهر. */
        card.innerHTML =
          '<div class="pdf-ico">' + svgIcon('file') + '</div>' +
          '<div class="pdf-copy"><div class="t" title="' + escapeHtml(summaryName) + '">' + escapeHtml(summaryName) + '</div>' +
            '<span class="pdf-kind">ملخص PDF</span></div>' +
          '<div class="acts" aria-label="خيارات الملخص">' +
            '<a class="btn btn-icon" target="_blank" rel="noopener" href="' + escapeHtml(res.src) + '" title="مشاهدة الملخص" aria-label="مشاهدة ' + escapeHtml(summaryName) + '">' + svgIcon('eye') + '</a>' +
            '<a class="btn btn-icon" download="' + escapeHtml(res.fileName || summaryName + '.pdf') + '" href="' + escapeHtml(res.src) + '" title="تنزيل الملخص" aria-label="تنزيل ' + escapeHtml(summaryName) + '">' + svgIcon('download') + '</a>' +
          '</div>';
        pdfEl.appendChild(card);
      });
    });
  } else {
    $('#pdfSection').style.display = 'none';
  }

  /* ---- الصور ---- */
  var images = resourcesOf(data, lesson.id, 'image');
  var galEl = $('#imgGallery');
  var lb = $('#lightbox');
  var lbImg = $('#lbImg'), lbCap = $('#lbCap');
  var resolvedImages = [];

  if (images.length) {
    images.forEach(function (img) {
      resolveSrc(img.url).then(function (res) {
        if (res.kind === 'error') return;
        var idx = resolvedImages.length;
        resolvedImages.push({ src: res.src, title: img.title || res.fileName || 'صورة' });

        var thumb = document.createElement('div');
        thumb.className = 'img-thumb';
        thumb.innerHTML = '<img alt="' + escapeHtml(img.title || 'صورة') + '" loading="lazy">' +
          '<div class="cap">' + escapeHtml(img.title || '') + '</div>';
        var im = thumb.querySelector('img');
        im.onerror = function () {
          im.style.display = 'none';
          thumb.style.background = 'linear-gradient(135deg, #7c5cff33, #f5c54222)';
          thumb.style.display = 'grid'; thumb.style.placeItems = 'center';
          thumb.insertAdjacentHTML('afterbegin', svgIcon('image'));
          thumb.querySelector('.ic').style.cssText = 'width:34px;height:34px;opacity:.55';
        };
        im.src = res.src;
        thumb.addEventListener('click', function () { openLightbox(idx); });
        galEl.appendChild(thumb);
      });
    });

    function openLightbox(i) {
      lbImg.src = resolvedImages[i].src;
      lbCap.textContent = resolvedImages[i].title;
      lb.dataset.i = i;
      lb.classList.add('open');
    }

    $('#lbClose').addEventListener('click', function () { lb.classList.remove('open'); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.classList.remove('open'); });
    $('#lbPrev').addEventListener('click', function (e) {
      e.stopPropagation();
      var i = (+lb.dataset.i - 1 + resolvedImages.length) % resolvedImages.length;
      openLightbox(i);
    });
    $('#lbNext').addEventListener('click', function (e) {
      e.stopPropagation();
      var i = (+lb.dataset.i + 1) % resolvedImages.length;
      openLightbox(i);
    });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') lb.classList.remove('open');
      if (e.key === 'ArrowLeft') $('#lbPrev').click();
      if (e.key === 'ArrowRight') $('#lbNext').click();
    });
  } else {
    $('#imgSection').style.display = 'none';
  }

  /* ---- التمارين ---- */
  var exs = resourcesOf(data, lesson.id, 'exercise');
  var exEl = $('#exBtns');
  if (exs.length) {
    exs.forEach(function (ex) {
      var type = ex.exerciseType || 'link';
      var btn = document.createElement('button');
      var exerciseTitle = ex.title || 'تمرين';
      btn.type = 'button';
      btn.className = 'ex-btn ex-' + type;
      btn.setAttribute('aria-label', 'فتح ' + exerciseTitle);
      var ico = svgIcon(type === 'video' ? 'film' : (type === 'pdf' ? 'file' : 'link'));
      var kindLbl = type === 'video' ? 'فيديو تطبيقي' : (type === 'pdf' ? 'تمرين PDF' : 'رابط تطبيقي');
      btn.innerHTML = '<span class="ex-icon">' + ico + '</span>' +
        '<span class="ex-copy"><strong>' + escapeHtml(exerciseTitle) + '</strong><small>' + kindLbl + '</small></span>' +
        '<span class="ex-go" aria-hidden="true">' + svgIcon('chevron-left') + '</span>';
      btn.addEventListener('click', function () {
        if (type === 'video' && document.getElementById('vpBox')) {
          /* تمرين فيديو → نشغّله في المشغل الرئيسي */
          player.load({ title: ex.title || 'تمرين', url: ex.url });
          $all('.vtab', tabsEl).forEach(function (t) { t.classList.remove('active'); });
          $('#playerShell').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          resolveSrc(ex.url).then(function (res) {
            if (res.kind === 'error') { toast(res.message, 'err'); return; }
            if (res.kind === 'youtube') { window.open('https://www.youtube.com/watch?v=' + res.id, '_blank'); return; }
            window.open(res.src, '_blank');
          });
        }
      });
      exEl.appendChild(btn);
    });
  } else {
    $('#exSection').style.display = 'none';
  }

  /* إذا كان الدرس فارغاً تماماً نعرض رابط إضافة المحتوى */
  if (!videos.length && !pdfs.length && !images.length && !exs.length) {
    $('#emptyAll').hidden = false;
  }

  $('#logoutBtn').addEventListener('click', doLogout);
}
