/* ============================================================
   آية باك 2027 — مكتبة أيقونات SVG
   ------------------------------------------------------------
   كل أيقونات الموقع (بديلة للإيموجي) — خطوط نظيفة بأسلوب موحد
   الاستخدام: svgIcon('اسم-الأيقونة') داخل JS
   أو: <i data-icon="اسم-الأيقونة"></i> داخل HTML
   (تُستبدل تلقائياً عند تحميل الصفحة عبر hydrateIcons)
   ============================================================ */
'use strict';

(function () {

  /* أيقونة خطية (stroke) */
  function S(paths, extra) {
    return '<svg class="ic"' + (extra || '') + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  /* أيقونة معبأة (fill) */
  function F(paths) {
    return '<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + paths + '</svg>';
  }

  window.ICONS = {
    /* --- عام --- */
    'cap': S('<path d="M22 9.5 12 4.5 2 9.5l10 5 10-5z"/><path d="M6 12.2V17c0 1.9 2.7 3.4 6 3.4s6-1.5 6-3.4v-4.8"/><path d="M22 9.5V15"/>'),
    'home': S('<path d="M3 10.2 12 3l9 7.2V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z"/><path d="M9.5 21.5v-6h5v6"/>'),
    'logout': S('<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'),
    'gear': S('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
    'search': S('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.5-4.5"/>'),
    'eye': S('<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    'eye-off': S('<path d="M17.94 17.94A10.4 10.4 0 0 1 12 19.5C5.5 19.5 2 12 2 12a17.6 17.6 0 0 1 4.3-5.4M9.9 4.7A9.9 9.9 0 0 1 12 4.5c6.5 0 10 7.5 10 7.5a17.6 17.6 0 0 1-2.2 3.2"/><path d="m2 2 20 20"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    'lock': S('<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>'),
    'unlock': S('<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.8-1.3"/>'),
    'key': S('<circle cx="7.5" cy="16.5" r="4.5"/><path d="M10.7 13.3 21 3"/><path d="m17 7 3 3"/><path d="m13.5 10.5 2 2"/>'),

    /* --- حالة --- */
    'check': S('<path d="m20 6-11 11-5-5"/>'),
    'x': S('<path d="M18 6 6 18M6 6l12 12"/>'),
    'check-circle': S('<circle cx="12" cy="12" r="9.5"/><path d="m8.3 12.4 2.6 2.6 5-5.5"/>'),
    'x-circle': S('<circle cx="12" cy="12" r="9.5"/><path d="m15 9-6 6M9 9l6 6"/>'),
    'alert': S('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5"/><path d="M12 17.2h.01"/>'),
    'info': S('<circle cx="12" cy="12" r="9.5"/><path d="M12 16.5V11"/><path d="M12 7.8h.01"/>'),
    'plus': S('<path d="M12 5v14M5 12h14"/>'),
    'sparkles': F('<path d="M12 2.5 13.7 7l4.5 1.7-4.5 1.7L12 15l-1.7-4.6L5.8 8.7 10.3 7z"/><path d="m19 14 .7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/><path d="m5 15.5.55 1.5 1.5.55-1.5.55L5 19.6l-.55-1.5-1.5-.55 1.5-.55z"/>'),
    'heart': S('<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1l1.7 1.7L12 21l7.1-6.6 1.7-1.7a5 5 0 0 0 0-7.1z"/>'),

    /* --- إجراءات --- */
    'trash': S('<path d="M3.5 6.5h17"/><path d="M8 6.5V4.5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 4.5v2"/><path d="M19 6.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5"/><path d="M10 11v6M14 11v6"/>'),
    'pencil': S('<path d="M17 3.5a2.1 2.1 0 0 1 3 3L7.5 19 3 20.5 4.5 16 17 3.5z"/>'),
    'chevron-up': S('<path d="m18 15-6-6-6 6"/>'),
    'chevron-down': S('<path d="m6 9 6 6 6-6"/>'),
    'chevron-left': S('<path d="m15 18-6-6 6-6"/>'),
    'chevron-right': S('<path d="m9 18 6-6-6-6"/>'),
    'download': S('<path d="M20.5 15v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V15"/><path d="m7 10 5 5 5-5"/><path d="M12 3v12"/>'),
    'upload': S('<path d="M20.5 15v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V15"/><path d="m7 8 5-5 5 5"/><path d="M12 3v12"/>'),
    'external': S('<path d="M18 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5.5"/><path d="M14.5 3H21v6.5"/><path d="M10 14 21 3"/>'),
    'refresh': S('<path d="M21 4v5h-5"/><path d="M3 20v-5h5"/><path d="M4.5 9a8.5 8.5 0 0 1 14-3.5L21 9"/><path d="m3 15 2.5 3.5A8.5 8.5 0 0 0 19.5 15"/>'),
    'copy': S('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    'save': S('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>'),
    'folder': S('<path d="M21.5 19a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.5l2 3h7.5a2 2 0 0 1 2 2z"/>'),

    /* --- المحتوى --- */
    'book': S('<path d="M4 19.2A2.3 2.3 0 0 1 6.3 17H20"/><path d="M6.3 2.5H20v19H6.3A2.3 2.3 0 0 1 4 19.2V4.8a2.3 2.3 0 0 1 2.3-2.3z"/>'),
    'book-open': S('<path d="M2 3.5h6a4 4 0 0 1 4 4V21a3 3 0 0 0-3-3H2z"/><path d="M22 3.5h-6a4 4 0 0 0-4 4V21a3 3 0 0 1 3-3h7z"/>'),
    'layers': S('<path d="m12 2.5 9.5 5L12 12.5 2.5 7.5z"/><path d="m2.5 12 9.5 5 9.5-5"/><path d="m2.5 16.5 9.5 5 9.5-5"/>'),
    'film': S('<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="M7 4v16M17 4v16"/><path d="M2.5 9h4.5M2.5 15h4.5M17 9h4.5M17 15h4.5"/><path d="M7 12h10"/>'),
    'file': S('<path d="M14 3H6.5A2 2 0 0 0 4.5 5v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5.5"/><path d="M8.5 13h7M8.5 17h7"/>'),
    'image': S('<rect x="3" y="3.5" width="18" height="17" rx="2"/><circle cx="8.7" cy="9" r="1.6"/><path d="m21 15.5-4.5-4.5L5.5 20.5"/>'),
    'link': S('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
    'pencil-line': S('<path d="M17 3.5a2.1 2.1 0 0 1 3 3L7.5 19 3 20.5 4.5 16 17 3.5z"/><path d="M14.5 6 18 9.5"/>'),
    'chart': S('<path d="M3.5 20.5h17"/><path d="M7 20.5v-6M12 20.5V9M17 20.5V4.5"/>'),

    /* --- مواد --- */
    'math': S('<path d="M4 3.5v17h16.5"/><path d="M7 16.5C8.5 10 12.5 7 18.5 6.5"/><circle cx="12" cy="11.5" r="1.1" fill="currentColor" stroke="none"/>'),
    'atom': '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(45 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(90 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(135 12 12)"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>',
    'dna': S('<path d="M5 3c0 6 14 6 14 12"/><path d="M19 3c0 6-14 6-14 12"/><path d="M6 17.5c.8 1.6 2.6 2.7 5 3.4M18 17.5c-.8 1.6-2.6 2.7-5 3.4"/><path d="M8.8 9h6.4"/>'),
    'bulb': S('<path d="M9.5 18h5M10.5 21h3"/><path d="M12 2.5a6.5 6.5 0 0 0-3.7 11.8c.7.5 1.2 1.3 1.2 2.2V18h5v-1.5c0-.9.5-1.7 1.2-2.2A6.5 6.5 0 0 0 12 2.5z"/>'),
    'globe': S('<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5a14.5 14.5 0 0 1 4 9.5 14.5 14.5 0 0 1-4 9.5 14.5 14.5 0 0 1-4-9.5 14.5 14.5 0 0 1 4-9.5z"/>'),
    'mosque': S('<path d="M3 21h18"/><path d="M4.5 21v-5.5C4.5 11.5 7.6 8.4 12 7c4.4 1.4 7.5 4.5 7.5 8.5V21"/><path d="M9.7 21v-3a2.3 2.3 0 0 1 4.6 0v3"/><path d="M12 7V4.5"/><path d="M2 21v-6M22 21v-6"/><path d="M1.3 15h1.4M21.3 15h1.4"/>'),

    /* --- أعلام --- */
    'fr': '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="6" height="14" fill="#0055A4"/><rect x="9" y="5" width="6" height="14" fill="#fff"/><rect x="15" y="5" width="6" height="14" fill="#EF4135"/><rect x="3" y="5" width="18" height="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".85"/></svg>',
    'gb': '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" fill="#012169"/><path d="M3 5l18 14M21 5 3 19" stroke="#fff" stroke-width="3.2"/><path d="M3 5l18 14M21 5 3 19" stroke="#C8102E" stroke-width="1.4"/><path d="M12 5v14M3 12h18" stroke="#fff" stroke-width="5"/><path d="M12 5v14M3 12h18" stroke="#C8102E" stroke-width="2.8"/><rect x="3" y="5" width="18" height="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".85"/></svg>',
    'dz': '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="9" height="14" fill="#006233"/><rect x="12" y="5" width="9" height="14" fill="#fff"/><path d="M14.6 8.3a4 4 0 1 0 0 7.4 3.9 3.9 0 1 1 0-7.4z" fill="#D21034"/><path d="m16.9 10.3.55 1.7h1.75l-1.4 1.05.5 1.7-1.4-1.05-1.4 1.05.5-1.7-1.4-1.05h1.75z" fill="#D21034"/><rect x="3" y="5" width="18" height="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".85"/></svg>',

    /* --- مشغل الفيديو --- */
    'play': F('<path d="M7.5 4.8v14.4L20 12z"/>'),
    'pause': F('<path d="M6.8 4.8h3.6v14.4H6.8zM13.6 4.8h3.6v14.4h-3.6z"/>'),
    'rewind': F('<path d="M11.7 5.3v13.4L2.8 12zM21.2 5.3v13.4L12.3 12z"/>'),
    'forward': F('<path d="M12.3 5.3v13.4L21.2 12zM2.8 5.3v13.4L11.7 12z"/>'),
    'volume-high': '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4.5 6 9H2.5v6H6l5 4.5z" fill="currentColor"/><path d="M15.2 8.8a4.5 4.5 0 0 1 0 6.4M18.6 5.4a9 9 0 0 1 0 13.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    'volume-low': '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4.5 6 9H2.5v6H6l5 4.5z" fill="currentColor"/><path d="M15.2 8.8a4.5 4.5 0 0 1 0 6.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    'volume-mute': '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4.5 6 9H2.5v6H6l5 4.5z" fill="currentColor"/><path d="m16 9 5 5M21 9l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    'fullscreen': S('<path d="M8 3.5H5A1.5 1.5 0 0 0 3.5 5v3M16 3.5h3A1.5 1.5 0 0 1 20.5 5v3M16 20.5h3a1.5 1.5 0 0 0 1.5-1.5v-3M8 20.5H5A1.5 1.5 0 0 1 3.5 19v-3"/>'),
    'pip': S('<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><rect x="12" y="12" width="7.5" height="5" rx="1" fill="currentColor" stroke="none"/>'),

    /* --- سحابة --- */
    'cloud': S('<path d="M17.5 19H7a4.5 4.5 0 0 1-.9-8.9 6 6 0 0 1 11.6 1.6A3.8 3.8 0 0 1 17.5 19z"/>'),
    'cloud-off': S('<path d="M17.5 19H7a4.5 4.5 0 0 1-.9-8.9 6 6 0 0 1 3.4-4.3M14.6 6.2a6 6 0 0 1 3.1 5.5 3.8 3.8 0 0 1 3.3 3.8M17.5 19a3.8 3.8 0 0 0 2-7"/><path d="m2 2 20 20"/>')
  };

  /* خريطة تحويل الإيموجي القديمة (في البيانات المحفوظة) إلى أيقونات SVG */
  window.EMOJI_ICON_MAP = {
    '📐': 'math', '📏': 'math', '🧮': 'math',
    '⚛️': 'atom', '⚛': 'atom',
    '🧬': 'dna', '🔬': 'dna',
    '📖': 'book-open', '📗': 'book', '📘': 'book', '📕': 'book', '📙': 'book',
    '📚': 'book', '🔠': 'book-open',
    '💭': 'bulb', '🧠': 'bulb', '💡': 'bulb',
    '🇫🇷': 'fr', '🇬🇧': 'gb', '🇩🇿': 'dz',
    '🗺️': 'globe', '🗺': 'globe', '🌍': 'globe', '🌎': 'globe',
    '🕌': 'mosque', '🕋': 'mosque',
    '📑': 'layers', '🗂️': 'layers',
    '🎬': 'film', '📺': 'film', '🎥': 'film',
    '📄': 'file', '📃': 'file', '📑 ': 'layers',
    '🖼️': 'image', '🖼': 'image', '🏞️': 'image',
    '✏️': 'pencil', '✏': 'pencil', '📝': 'pencil',
    '📁': 'folder', '📂': 'folder',
    '🔗': 'link', '🌐': 'link',
    '🎓': 'cap', '⚙️': 'gear', '⚙': 'gear',
    '🏠': 'home', '⬆': 'chevron-up', '⬇': 'chevron-down',
    '✎': 'pencil', '🗑': 'trash', '🗑️': 'trash', '👁': 'eye', '👁️': 'eye'
  };

  /* إرجاع HTML الأيقونة بالاسم */
  window.svgIcon = function (name, cls) {
    var s = window.ICONS[name];
    if (!s) return '';
    return cls ? s.replace('class="ic"', 'class="ic ' + cls + '"') : s;
  };
})();
