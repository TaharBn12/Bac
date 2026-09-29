/* ============================================================
   آية باك 2027 — البيانات الافتراضية (تُعدَّل من لوحة التحكم)
   ============================================================ */
'use strict';

window.DEFAULT_DATA = {
  subjects: [
    { id: 's-math', name: 'الرياضيات',           icon: '📐', color: 'indigo',  order: 1 },
    { id: 's-phys', name: 'العلوم الفيزيائية',   icon: '⚛️', color: 'teal',    order: 2 },
    { id: 's-svt',  name: 'علوم الطبيعة والحياة', icon: '🧬', color: 'green',   order: 3 },
    { id: 's-ar',   name: 'اللغة العربية',        icon: '📖', color: 'amber',   order: 4 },
    { id: 's-phil', name: 'الفلسفة',              icon: '💭', color: 'purple',  order: 5 },
    { id: 's-fr',   name: 'اللغة الفرنسية',       icon: '🇫🇷', color: 'blue',    order: 6 },
    { id: 's-en',   name: 'اللغة الإنجليزية',     icon: '🇬🇧', color: 'sky',     order: 7 },
    { id: 's-hg',   name: 'التاريخ والجغرافيا',   icon: '🗺️', color: 'rose',    order: 8 },
    { id: 's-isl',  name: 'العلوم الإسلامية',     icon: '🕌', color: 'emerald', order: 9 }
  ],

  units: [
    /* الرياضيات */
    { id: 'u-math-1', subjectId: 's-math', title: 'النهايات والاتصال',              order: 1 },
    { id: 'u-math-2', subjectId: 's-math', title: 'الاشتقاق ودراسة الدوال',        order: 2 },
    { id: 'u-math-3', subjectId: 's-math', title: 'الدوال اللوغاريتمية والأسية',    order: 3 },
    { id: 'u-math-4', subjectId: 's-math', title: 'حساب التكامل',                   order: 4 },
    { id: 'u-math-5', subjectId: 's-math', title: 'الأعداد العقدية',                order: 5 },
    { id: 'u-math-6', subjectId: 's-math', title: 'المتتاليات والمعادلات التفاضلية', order: 6 },
    /* الفيزياء */
    { id: 'u-phys-1', subjectId: 's-phys', title: 'التطور الزمني للأنظمة الميكانيكية', order: 1 },
    { id: 'u-phys-2', subjectId: 's-phys', title: 'الظواهر الكهربائية',            order: 2 },
    { id: 'u-phys-3', subjectId: 's-phys', title: 'الموجات',                        order: 3 },
    { id: 'u-phys-4', subjectId: 's-phys', title: 'التحولات النووية',               order: 4 },
    /* علوم الطبيعة والحياة */
    { id: 'u-svt-1', subjectId: 's-svt', title: 'تركيب البروتين',       order: 1 },
    { id: 'u-svt-2', subjectId: 's-svt', title: 'إنتاج الطاقة الخلوية', order: 2 },
    { id: 'u-svt-3', subjectId: 's-svt', title: 'المناعة',              order: 3 },
    { id: 'u-svt-4', subjectId: 's-svt', title: 'التناسق الوظيفي',      order: 4 },
    /* العربية */
    { id: 'u-ar-1', subjectId: 's-ar', title: 'النص الشعري',        order: 1 },
    { id: 'u-ar-2', subjectId: 's-ar', title: 'النص النثري',        order: 2 },
    { id: 'u-ar-3', subjectId: 's-ar', title: 'البلاغة والعروض',    order: 3 },
    { id: 'u-ar-4', subjectId: 's-ar', title: 'التعبير والإنشاء',   order: 4 },
    /* الفلسفة */
    { id: 'u-phil-1', subjectId: 's-phil', title: 'الأخلاق',  order: 1 },
    { id: 'u-phil-2', subjectId: 's-phil', title: 'المعرفة',  order: 2 },
    { id: 'u-phil-3', subjectId: 's-phil', title: 'الشعر والعلم', order: 3 },
    /* الفرنسية */
    { id: 'u-fr-1', subjectId: 's-fr', title: 'La poésie',   order: 1 },
    { id: 'u-fr-2', subjectId: 's-fr', title: 'Le théâtre',  order: 2 },
    { id: 'u-fr-3', subjectId: 's-fr', title: 'Le roman',    order: 3 },
    /* الإنجليزية */
    { id: 'u-en-1', subjectId: 's-en', title: 'Science and Technology', order: 1 },
    { id: 'u-en-2', subjectId: 's-en', title: 'Ethics and Values',      order: 2 },
    { id: 'u-en-3', subjectId: 's-en', title: 'Bac Exam Preparation',   order: 3 },
    /* التاريخ والجغرافيا */
    { id: 'u-hg-1', subjectId: 's-hg', title: 'العالم بين الحربين (1919–1939)', order: 1 },
    { id: 'u-hg-2', subjectId: 's-hg', title: 'الحرب العالمية الثانية (1939–1945)', order: 2 },
    { id: 'u-hg-3', subjectId: 's-hg', title: 'الجزائر (1954–1962) وما بعدها', order: 3 },
    /* العلوم الإسلامية */
    { id: 'u-isl-1', subjectId: 's-isl', title: 'القرآن الكريم',     order: 1 },
    { id: 'u-isl-2', subjectId: 's-isl', title: 'الحديث الشريف',     order: 2 },
    { id: 'u-isl-3', subjectId: 's-isl', title: 'القيم الإسلامية',   order: 3 }
  ],

  lessons: [
    /* الرياضيات */
    { id: 'l-math-1-1', unitId: 'u-math-1', title: 'نهاية دالة عند نقطة وفي اللانهاية', order: 1 },
    { id: 'l-math-1-2', unitId: 'u-math-1', title: 'العمليات على النهايات', order: 2 },
    { id: 'l-math-1-3', unitId: 'u-math-1', title: 'الاتصال', order: 3 },
    { id: 'l-math-2-1', unitId: 'u-math-2', title: 'الدالة المشتقة', order: 1 },
    { id: 'l-math-2-2', unitId: 'u-math-2', title: 'تطبيقات الاشتقاق في دراسة الدوال', order: 2 },
    { id: 'l-math-2-3', unitId: 'u-math-2', title: 'المماسات', order: 3 },
    { id: 'l-math-3-1', unitId: 'u-math-3', title: 'الدالة اللوغاريتمية النيبيرية', order: 1 },
    { id: 'l-math-3-2', unitId: 'u-math-3', title: 'الدالة الأسية', order: 2 },
    { id: 'l-math-4-1', unitId: 'u-math-4', title: 'جدول الدوال الأصلية وحساب التكامل', order: 1 },
    { id: 'l-math-4-2', unitId: 'u-math-4', title: 'تطبيقات التكامل: المساحات والحجوم', order: 2 },
    { id: 'l-math-5-1', unitId: 'u-math-5', title: 'الشكل الجبري للعدد العقدي', order: 1 },
    { id: 'l-math-5-2', unitId: 'u-math-5', title: 'الشكل المثلثي والأسي', order: 2 },
    { id: 'l-math-6-1', unitId: 'u-math-6', title: 'المتتاليات العددية', order: 1 },
    { id: 'l-math-6-2', unitId: 'u-math-6', title: 'المعادلات التفاضلية', order: 2 },
    /* الفيزياء */
    { id: 'l-phys-1-1', unitId: 'u-phys-1', title: 'السقوط الشاقولي لجسم صلب', order: 1 },
    { id: 'l-phys-1-2', unitId: 'u-phys-1', title: 'الحركة في مجال ثقالي منتظم', order: 2 },
    { id: 'l-phys-1-3', unitId: 'u-phys-1', title: 'الطاقة الحركية وطاقة الوضع', order: 3 },
    { id: 'l-phys-2-1', unitId: 'u-phys-2', title: 'ثنائي القطب RC', order: 1 },
    { id: 'l-phys-2-2', unitId: 'u-phys-2', title: 'ثنائي القطب RL', order: 2 },
    { id: 'l-phys-2-3', unitId: 'u-phys-2', title: 'الدارة RLC المقهورة', order: 3 },
    { id: 'l-phys-3-1', unitId: 'u-phys-3', title: 'انتشار موجة ميكانيكية توافقية', order: 1 },
    { id: 'l-phys-3-2', unitId: 'u-phys-3', title: 'الموجات الضوئية: الانعراج والتداخل', order: 2 },
    { id: 'l-phys-4-1', unitId: 'u-phys-4', title: 'النشاط الإشعاعي وقانون التناقص', order: 1 },
    { id: 'l-phys-4-2', unitId: 'u-phys-4', title: 'التحولات النووية التلقائية والمستحثة', order: 2 },
    /* SVT */
    { id: 'l-svt-1-1', unitId: 'u-svt-1', title: 'العلاقة بين البروتين والنشاط البيولوجي', order: 1 },
    { id: 'l-svt-1-2', unitId: 'u-svt-1', title: 'آليات تركيب البروتين: النسخ والترجمة', order: 2 },
    { id: 'l-svt-2-1', unitId: 'u-svt-2', title: 'التنفس الخلوي', order: 1 },
    { id: 'l-svt-2-2', unitId: 'u-svt-2', title: 'التخمر', order: 2 },
    { id: 'l-svt-3-1', unitId: 'u-svt-3', title: 'المناعة الطبيعية', order: 1 },
    { id: 'l-svt-3-2', unitId: 'u-svt-3', title: 'المناعة المكتسبة النوعية', order: 2 },
    { id: 'l-svt-4-1', unitId: 'u-svt-4', title: 'التناسق العصبي', order: 1 },
    { id: 'l-svt-4-2', unitId: 'u-svt-4', title: 'التناسق الهرموني', order: 2 },
    /* العربية */
    { id: 'l-ar-1-1', unitId: 'u-ar-1', title: 'من الشعر العربي الحديث: دراسة نصوص', order: 1 },
    { id: 'l-ar-2-1', unitId: 'u-ar-2', title: 'المقال الأدبي والعلمي', order: 1 },
    { id: 'l-ar-3-1', unitId: 'u-ar-3', title: 'الصور البيانية والمحسنات البديعية', order: 1 },
    { id: 'l-ar-3-2', unitId: 'u-ar-3', title: 'العروض والقافية', order: 2 },
    { id: 'l-ar-4-1', unitId: 'u-ar-4', title: 'كتابة مقال أدبي', order: 1 },
    /* الفلسفة */
    { id: 'l-phil-1-1', unitId: 'u-phil-1', title: 'الواجب', order: 1 },
    { id: 'l-phil-1-2', unitId: 'u-phil-1', title: 'السعادة', order: 2 },
    { id: 'l-phil-2-1', unitId: 'u-phil-2', title: 'التجربة', order: 1 },
    { id: 'l-phil-2-2', unitId: 'u-phil-2', title: 'النظرية', order: 2 },
    { id: 'l-phil-3-1', unitId: 'u-phil-3', title: 'الشعر', order: 1 },
    { id: 'l-phil-3-2', unitId: 'u-phil-3', title: 'العلوم', order: 2 },
    /* الفرنسية */
    { id: 'l-fr-1-1', unitId: 'u-fr-1', title: 'Lecture de textes poétiques', order: 1 },
    { id: 'l-fr-2-1', unitId: 'u-fr-2', title: 'Le texte théâtral', order: 1 },
    { id: 'l-fr-3-1', unitId: 'u-fr-3', title: 'Le récit et ses techniques', order: 1 },
    /* الإنجليزية */
    { id: 'l-en-1-1', unitId: 'u-en-1', title: 'Reading: Science & Technology', order: 1 },
    { id: 'l-en-2-1', unitId: 'u-en-2', title: 'Writing: Argumentative Essay', order: 1 },
    { id: 'l-en-3-1', unitId: 'u-en-3', title: 'Exam Strategies & Practice', order: 1 },
    /* تاريخ وجغرافيا */
    { id: 'l-hg-1-1', unitId: 'u-hg-1', title: 'الأزمة الاقتصادية الكبرى (1929)', order: 1 },
    { id: 'l-hg-1-2', unitId: 'u-hg-1', title: 'صعود الأنظمة الديكتاتورية', order: 2 },
    { id: 'l-hg-2-1', unitId: 'u-hg-2', title: 'مجريات الحرب العالمية الثانية ونتائجها', order: 1 },
    { id: 'l-hg-3-1', unitId: 'u-hg-3', title: 'اندلاع الثورة التحريرية ومسارها', order: 1 },
    { id: 'l-hg-3-2', unitId: 'u-hg-3', title: 'الجزائر بعد 1962: البناء والتقدم', order: 2 },
    /* إسلامية */
    { id: 'l-isl-1-1', unitId: 'u-isl-1', title: 'تلاوة وتفسير السور المقررة', order: 1 },
    { id: 'l-isl-2-1', unitId: 'u-isl-2', title: 'شرح الأحاديث النبوية', order: 1 },
    { id: 'l-isl-3-1', unitId: 'u-isl-3', title: 'القيم الإسلامية في الحياة', order: 1 }
  ],

  /* الموارد: kind = video | pdf | image | exercise  (exerciseType: video | pdf | link) */
  resources: [
    /* نموذج تجريبي — درس "نهاية دالة" في الرياضيات */
    { id: 'r-demo-1', lessonId: 'l-math-1-1', kind: 'video', title: 'فيديو 1 (نموذج تجريبي)', order: 1,
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
    { id: 'r-demo-2', lessonId: 'l-math-1-1', kind: 'video', title: 'فيديو 2 (نموذج تجريبي)', order: 2,
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
    { id: 'r-demo-3', lessonId: 'l-math-1-1', kind: 'pdf', title: 'ملخص الدرس PDF (نموذج تجريبي)', order: 1,
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
    { id: 'r-demo-4', lessonId: 'l-math-1-1', kind: 'image', title: 'صورة توضيحية 1 (نموذج)', order: 1,
      url: 'https://picsum.photos/seed/aya-bac-1/900/560' },
    { id: 'r-demo-5', lessonId: 'l-math-1-1', kind: 'image', title: 'صورة توضيحية 2 (نموذج)', order: 2,
      url: 'https://picsum.photos/seed/aya-bac-2/900/560' },
    { id: 'r-demo-6', lessonId: 'l-math-1-1', kind: 'exercise', exerciseType: 'pdf', title: 'تمرين تطبيقي (نموذج)', order: 1,
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
    { id: 'r-demo-7', lessonId: 'l-math-1-1', kind: 'exercise', exerciseType: 'link', title: 'رابط مفيد (نموذج)', order: 2,
      url: 'https://www.edunet.tn' },
    /* نموذج تجريبي — درس السقوط الشاقولي في الفيزياء */
    { id: 'r-demo-8', lessonId: 'l-phys-1-1', kind: 'video', title: 'فيديو (نموذج تجريبي)', order: 1,
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
    { id: 'r-demo-9', lessonId: 'l-phys-1-1', kind: 'exercise', exerciseType: 'pdf', title: 'سلسلة تمارين (نموذج)', order: 1,
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
    /* نموذج تجريبي — درس تركيب البروتين (رابط يوتيوب) */
    { id: 'r-demo-10', lessonId: 'l-svt-1-2', kind: 'video', title: 'درس عبر يوتيوب (نموذج تجريبي)', order: 1,
      url: 'https://www.youtube.com/watch?v=aircAruvnKk' }
  ]
};
