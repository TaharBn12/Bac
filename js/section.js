/* ============================================================
   آية باك 2027 — صفحة القسم/الصفحة الديناميكية
   (مثال: بكالوريات ← سنوات ← مواضيع الامتحان + الحلول)
   ============================================================ */
'use strict';

function initSectionPage() {
  requireAuth();
  hydrateIcons();
  var data = loadData();
  ensureSectionsArray(data);

  var section = getSection(data, param('section'));
  if (!section) { location.replace('home.html'); return; }

  var path = sectionPath(data, section.id);
  var subject = (path && path.subject) || { id: '', name: 'مادة', color: '', icon: 'book' };
  var colorClass = subject.color ? 'c-' + subject.color : '';
  var chain = (path && path.sections) || [section];

  /* التمرين المستقل وسنة البكالوريا يُقسَّمان تلقائياً إلى «الموضوع» و«الحل» */
  var parentSection = chain.length > 1 ? chain[chain.length - 2] : null;
  var hasParts = sectionNeedsParts(data, section);
  var parts = hasParts ? ensureSectionParts(data, section) : null;

  document.title = 'آية باك 2027 — ' + section.title +
    (parentSection ? ' — ' + parentSection.title : '');

  /* ---------- مسار التنقل ---------- */
  var crumbs = [{ label: 'الرئيسية', href: 'home.html', icon: 'home' }];
  if (subject.id) crumbs.push({ label: subject.name, href: 'subject.html?subject=' + encodeURIComponent(subject.id) });
  /* التمرين المستقل يندرج تحت تبويب «التمارين» في صفحة المادة */
  if (chain[0] && chain[0].kind === 'exercise' && subject.id) {
    crumbs.push({ label: 'التمارين', href: 'subject.html?subject=' + encodeURIComponent(subject.id) + '&tab=exercises' });
  }
  chain.forEach(function (s, i) {
    if (i === chain.length - 1) crumbs.push({ label: s.title });
    else crumbs.push({ label: s.title, href: 'section.html?section=' + encodeURIComponent(s.id) });
  });
  $('#crumbs').innerHTML = breadcrumb(crumbs);

  /* ---------- الترويسة ---------- */
  var kids = sectionChildrenOf(data, section.id);
  var resCount = resourcesOf(data, section.id).length;
  var done = isItemCompleted(section.id);

  function renderHead() {
    $('#secHead').innerHTML =
      '<div class="page-head section-hero ' + colorClass + '">' +
        '<div class="icon">' + iconHTML(section.icon, 'file') + '</div>' +
        '<div class="subj-hero-body">' +
          '<div class="subj-hero-title-row">' +
            '<h1>' + escapeHtml(section.title) + '</h1>' +
            (parentSection ? '<span class="part-of-badge">' + iconHTML(parentSection.icon, 'layers') + ' ' + escapeHtml(parentSection.title) + '</span>' : '') +
            (subject.name ? '<span class="subj-coeff-badge">' + escapeHtml(subject.name) + '</span>' : '') +
          '</div>' +
          '<div class="meta">' + svgIcon('layers') + ' ' +
            (parts
              ? 'جزأين: الموضوع والحل'
              : (kids.length ? kids.length + ' أقسام فرعية · ' : '') + resCount + ' عنصر محتوى') +
          '</div>' +
          '<div class="sec-head-acts">' +
            '<button type="button" class="btn-complete-item' + (isItemCompleted(section.id) ? ' is-completed' : '') + '" id="secCompleteBtn">' +
              svgIcon(isItemCompleted(section.id) ? 'check-circle' : 'check') +
              '<span>' + (isItemCompleted(section.id) ? 'مكتمل ✓' : 'تحديد كمكتمل') + '</span>' +
            '</button>' +
            (chain.length > 1
              ? '<a class="btn btn-sm" href="section.html?section=' + encodeURIComponent(chain[chain.length - 2].id) + '">' +
                  svgIcon('chevron-right') + ' رجوع</a>'
              : (subject.id ? '<a class="btn btn-sm" href="subject.html?subject=' + encodeURIComponent(subject.id) + '">' +
                  svgIcon('chevron-right') + ' ' + escapeHtml(subject.name) + '</a>' : '')) +
          '</div>' +
        '</div>' +
      '</div>';

    var btn = $('#secCompleteBtn');
    if (btn) btn.addEventListener('click', function () {
      var nowDone = toggleItemCompleted(section.id);
      renderHead();
      toast(nowDone ? 'أحسنت! تم تحديد القسم كمكتمل' : 'تم إلغاء علامة الإكمال', nowDone ? 'ok' : 'info');
    });
  }
  renderHead();

  /* ---------- الأقسام الفرعية ---------- */
  var childrenEl = $('#childrenSection');

  /* حالة خاصة: التمرين / سنة البكالوريا → بطاقتان: «الموضوع» و«الحل» */
  if (parts) {
    $('#childrenTitle').textContent = escapeHtml(section.title) + ' — اختر الموضوع أو الحل';
    $('#childrenGrid').className = 'part-cards';
    $('#childrenGrid').innerHTML = ['topic', 'solution'].map(function (kind) {
      var part = parts[kind];
      var meta = PART_META[kind];
      var has = part ? sectionHasContent(data, part.id) : false;
      var count = part ? resourcesOf(data, part.id).length : 0;
      var subKids = part ? sectionChildrenOf(data, part.id).length : 0;
      return '<a class="part-card part-' + kind + (has ? '' : ' is-empty') + ' ' + colorClass + '" ' +
          'href="' + (has && part ? 'section.html?section=' + encodeURIComponent(part.id) : '#') + '"' +
          (has ? '' : ' data-empty-part="' + kind + '"') + '>' +
        '<span class="pc-ico">' + svgIcon(meta.icon) + '</span>' +
        '<span class="pc-body">' +
          '<span class="pc-title">' + meta.label + '</span>' +
          '<span class="pc-sub">' + (has
            ? (count ? count + ' عنصر محتوى' : (subKids ? subKids + ' أقسام فرعية' : 'متوفر'))
            : 'لم يضاف بعد') + '</span>' +
        '</span>' +
        '<span class="pc-go">' + (has ? '‹' : svgIcon('clock')) + '</span>' +
      '</a>';
    }).join('');

    /* الضغط على جزء فارغ → رسالة تنبيه (توست) بدل فتح صفحة فارغة */
    $all('[data-empty-part]', $('#childrenGrid')).forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var kind = el.dataset.emptyPart;
        toast((PART_META[kind] || PART_META.solution).empty, 'info');
      });
    });
  } else if (kids.length) {
    $('#childrenTitle').textContent = 'استعرض حسب ' + section.title;
    $('#childrenGrid').className = 'grid sec-children';
    $('#childrenGrid').innerHTML = kids.map(function (c, i) {
      var subKids = sectionChildrenOf(data, c.id).length;
      var subRes = resourcesOf(data, c.id).length;
      var cDone = isItemCompleted(c.id);
      return '<a class="sec-card sec-card-lg' + (cDone ? ' is-done' : '') + ' ' + colorClass + '" href="section.html?section=' + encodeURIComponent(c.id) + '">' +
        '<span class="sec-num">' + (i + 1) + '</span>' +
        '<span class="sec-ico">' + iconHTML(c.icon, 'folder') + '</span>' +
        '<span class="sec-body">' +
          '<span class="sec-title">' + escapeHtml(c.title) + '</span>' +
          '<span class="badges">' +
            (subKids ? '<span class="badge on">' + svgIcon('layers') + ' ' + subKids + ' أقسام</span>' : '') +
            (subRes ? '<span class="badge on">' + svgIcon('file') + ' ' + subRes + ' عنصر</span>' : '') +
            (!subKids && !subRes ? '<span class="badge">لا محتوى بعد</span>' : '') +
          '</span>' +
        '</span>' +
        '<span class="sec-arrow">‹</span>' +
      '</a>';
    }).join('');
  } else {
    childrenEl.style.display = 'none';
  }

  /* ---------- المحتوى: فيديو / PDF / صور / تمارين ---------- */
  var videos = resourcesOf(data, section.id, 'video');
  var pdfs   = resourcesOf(data, section.id, 'pdf');
  var images = resourcesOf(data, section.id, 'image');
  var exs    = resourcesOf(data, section.id, 'exercise');

  var player = null;
  var shellEl = $('#playerShell');
  var tabsEl = $('#videoTabs');

  /* ---- الفيديوهات ---- */
  if (videos.length) {
    shellEl.hidden = false;
    player = new AyaPlayer(shellEl);
    tabsEl.innerHTML = videos.map(function (v, i) {
      return '<button class="vtab' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">' +
        svgIcon('play') + ' ' + escapeHtml((i + 1) + '. ' + (v.groupTitle || v.title || 'فيديو')) + '</button>';
    }).join('');
    tabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.vtab');
      if (!btn) return;
      $all('.vtab', tabsEl).forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      player.load(videos[+btn.dataset.i]);
      shellEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    player.load(videos[0]);
  } else {
    shellEl.hidden = true;
    tabsEl.hidden = true;
    $('#videoSection').style.display = 'none';
  }

  /* ---- ملفات PDF ---- */
  var pdfEl = $('#pdfGrid');
  if (pdfs.length) {
    pdfs.forEach(function (p) {
      var slot = document.createElement('article');
      slot.className = 'pdf-card pdf-card-loading';
      pdfEl.appendChild(slot);
      resolveSrc(p.url).then(function (res) {
        if (res.kind === 'error') { slot.remove(); return; }
        var name = p.groupTitle || p.title || res.fileName || 'ملف PDF';
        slot.className = 'pdf-card';
        slot.innerHTML =
          '<div class="pdf-ico">' + svgIcon('file') + '</div>' +
          '<div class="pdf-copy"><div class="t" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</div>' +
            '<span class="pdf-kind">ملف PDF</span></div>' +
          '<div class="acts">' +
            '<a class="btn btn-icon" target="_blank" rel="noopener" href="' + escapeHtml(res.src) + '" title="مشاهدة">' + svgIcon('eye') + '</a>' +
            '<a class="btn btn-icon" download="' + escapeHtml(res.fileName || name + '.pdf') + '" href="' + escapeHtml(res.src) + '" title="تنزيل">' + svgIcon('download') + '</a>' +
          '</div>';
      });
    });
  } else {
    $('#pdfSection').style.display = 'none';
  }

  /* ---- الصور + عارض الصور ---- */
  var lb = $('#lightbox');
  var lbImg = $('#lbImg');
  var lbCap = $('#lbCap');
  var activeItems = [];

  function showLightbox(list, idx) {
    if (!list[idx]) return;
    activeItems = list;
    lbImg.src = list[idx].src;
    lbCap.textContent = list[idx].title || '';
    lb.dataset.i = String(idx);
    $('#lbPrev').hidden = list.length <= 1;
    $('#lbNext').hidden = list.length <= 1;
    lb.classList.add('open');
  }

  if (lb) {
    $('#lbClose').addEventListener('click', function () { lb.classList.remove('open'); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.classList.remove('open'); });
    $('#lbPrev').addEventListener('click', function (e) {
      e.stopPropagation();
      if (activeItems.length <= 1) return;
      showLightbox(activeItems, (+lb.dataset.i + 1) % activeItems.length);
    });
    $('#lbNext').addEventListener('click', function (e) {
      e.stopPropagation();
      if (activeItems.length <= 1) return;
      showLightbox(activeItems, (+lb.dataset.i - 1 + activeItems.length) % activeItems.length);
    });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') lb.classList.remove('open');
      if (e.key === 'ArrowLeft') $('#lbPrev').click();
      if (e.key === 'ArrowRight') $('#lbNext').click();
    });
  }

  if (images.length) {
    var galEl = $('#imgGallery');
    var slots = new Array(images.length);
    images.forEach(function (img, i) {
      var cap = img.groupTitle || img.title || ('صورة ' + (i + 1));
      var th = document.createElement('div');
      th.className = 'img-thumb';
      th.innerHTML = '<img alt="' + escapeHtml(cap) + '" loading="lazy"><div class="cap">' + escapeHtml(cap) + '</div>';
      galEl.appendChild(th);
      resolveSrc(img.url).then(function (res) {
        if (res.kind === 'error') { th.remove(); return; }
        slots[i] = { src: res.src, title: cap };
        th.querySelector('img').src = res.src;
        th.addEventListener('click', function () {
          var valid = slots.filter(Boolean);
          showLightbox(valid, valid.indexOf(slots[i]));
        });
      });
    });
  } else {
    $('#imgSection').style.display = 'none';
  }

  /* ---- التمارين والروابط ---- */
  if (exs.length) {
    var exEl = $('#exBtns');
    exs.forEach(function (ex) {
      var type = ex.exerciseType || 'link';
      var title = ex.groupTitle || ex.title || 'ملف';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ex-btn ex-' + type;
      var ico = svgIcon(type === 'video' ? 'film' : (type === 'pdf' ? 'file' : (type === 'image' ? 'image' : 'link')));
      var kindLbl = type === 'video' ? 'فيديو' : (type === 'pdf' ? 'ملف PDF' : (type === 'image' ? 'صورة' : 'رابط'));
      btn.innerHTML = '<span class="ex-icon">' + ico + '</span>' +
        '<span class="ex-copy"><strong>' + escapeHtml(title) + '</strong><small>' + kindLbl + '</small></span>' +
        '<span class="ex-go">' + svgIcon('chevron-left') + '</span>';
      btn.addEventListener('click', function () {
        if (type === 'video') {
          if (!player) { shellEl.hidden = false; $('#videoSection').style.display = ''; player = new AyaPlayer(shellEl); }
          $all('.vtab', tabsEl).forEach(function (t) { t.classList.remove('active'); });
          player.load({ title: title, url: ex.url });
          shellEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        resolveSrc(ex.url).then(function (res) {
          if (res.kind === 'error') { toast(res.message, 'err'); return; }
          if (type === 'image') { showLightbox([{ src: res.src, title: title }], 0); return; }
          if (res.kind === 'youtube') { window.open('https://www.youtube.com/watch?v=' + res.id, '_blank'); return; }
          window.open(res.src, '_blank');
        });
      });
      exEl.appendChild(btn);
    });
  } else {
    $('#exSection').style.display = 'none';
  }

  if (!videos.length && !pdfs.length && !images.length && !exs.length && !kids.length && !parts) {
    $('#emptyAll').hidden = false;
  }

  var outBtn = $('#logoutBtn');
  if (outBtn) outBtn.addEventListener('click', doLogout);
}
