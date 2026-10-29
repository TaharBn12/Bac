// ============================================================
// آية باك 2027 — خادم الذكاء الاصطناعي و Claude MCP (Supabase Edge Function)
// ------------------------------------------------------------
// يدعم في نقطة واحدة:
//   1) خادم Remote MCP متوافق مع Claude.ai و Claude Desktop (Streamable HTTP JSON-RPC 2.0)
//   2) استخراج قوائم تشغيل وفيديوهات يوتيوب وتقسيمها ذكياً (المادة ← الوحدة ← الدرس/التمرين)
//   3) المجموعات الديناميكية للموارد (عنوان + صورة/فيديو/PDF أو عدة عناصر تحت نفس العنوان)
//   4) حماية صارمة عبر سياسات RLS وترويسة x-admin-key على الجداول الأربعة فقط
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, mcp-session-id, Mcp-Protocol-Version, mcp-protocol-version, Last-Event-ID, x-admin-key, x-client-info, apikey",
  "Access-Control-Expose-Headers":
    "Mcp-Session-Id, mcp-session-id, Mcp-Protocol-Version",
};

type AllowedTable = "subjects" | "units" | "lessons" | "resources";
const ALLOWED_TABLES = new Set<string>(["subjects", "units", "lessons", "resources"]);

interface SubjectRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
}
interface UnitRow {
  id: string;
  subject_id: string;
  title: string;
  sort_order: number;
}
interface LessonRow {
  id: string;
  unit_id: string;
  title: string;
  item_type?: "lesson" | "exercise" | string;
  sort_order: number;
}
interface ResourceRow {
  id: string;
  lesson_id: string;
  kind: "video" | "pdf" | "image" | "exercise" | string;
  title: string | null;
  url: string;
  size: number | null;
  exercise_type: string | null;
  group_id?: string | null;
  group_title?: string | null;
  sort_order: number;
}
interface SiteData {
  subjects: SubjectRow[];
  units: UnitRow[];
  lessons: LessonRow[];
  resources: ResourceRow[];
}

interface PlaylistVideoItem {
  index: number;
  video_id: string;
  title: string;
  cleaned_title: string;
  url: string;
  duration: string;
  is_exercise_hint: boolean;
  unit_hint: string | null;
  base_lesson_title: string;
  part_label: string | null;
}

interface ExtractedPlaylist {
  playlist_id: string | null;
  title: string;
  author: string;
  source_url: string;
  video_count: number;
  detected_subject_hint: { name: string; icon: string; color: string; keywords_matched: string[] } | null;
  videos: PlaylistVideoItem[];
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function decodeBase64UrlUtf8(input: string): string {
  try {
    let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function parseRequestAuthAndRoute(req: Request): { subPath: string; adminKey: string } {
  const url = new URL(req.url);
  let path = url.pathname;

  path = path.replace(/^\/functions\/v1\/aya-mcp\b/, "").replace(/^\/aya-mcp\b/, "");
  if (!path.startsWith("/")) path = "/" + path;

  let adminKey = "";

  const b64Match = path.match(/^\/k\/([A-Za-z0-9_-]+)(\/.*)?$/);
  if (b64Match) {
    adminKey = decodeBase64UrlUtf8(b64Match[1]);
    path = b64Match[2] || "/";
  } else {
    const keyMatch = path.match(/^\/key\/([^/]+)(\/.*)?$/);
    if (keyMatch) {
      try {
        adminKey = decodeURIComponent(keyMatch[1]);
      } catch {
        adminKey = keyMatch[1];
      }
      path = keyMatch[2] || "/";
    }
  }

  if (!adminKey) {
    adminKey = url.searchParams.get("key") || url.searchParams.get("token") || "";
  }

  if (!adminKey) {
    adminKey = req.headers.get("x-admin-key") || "";
  }

  if (!adminKey) {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && m[1] && m[1].trim() !== SUPABASE_ANON_KEY) {
      adminKey = m[1].trim();
    }
  }

  return { subPath: path || "/", adminKey };
}

function assertAllowedTable(table: string): asserts table is AllowedTable {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`جدول غير مسموح به: ${table}`);
  }
}

function dbHeaders(adminKey: string, prefer?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  if (adminKey) h["x-admin-key"] = adminKey;
  if (prefer) h["Prefer"] = prefer;
  return h;
}

async function dbSelectAll(): Promise<SiteData> {
  const fetchTable = async <T>(table: AllowedTable): Promise<T[]> => {
    assertAllowedTable(table);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&order=sort_order.asc`,
      { headers: dbHeaders("") },
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`فشل قراءة جدول ${table}: ${txt}`);
    }
    return (await res.json()) as T[];
  };

  const [subjects, units, lessons, resources] = await Promise.all([
    fetchTable<SubjectRow>("subjects"),
    fetchTable<UnitRow>("units"),
    fetchTable<LessonRow>("lessons"),
    fetchTable<ResourceRow>("resources"),
  ]);

  return { subjects, units, lessons, resources };
}

function authErrorMsg(): string {
  return "⛔ رفضت قاعدة البيانات عملية الكتابة: مفتاح الإدارة (x-admin-key) مفقود أو غير مطابق لكلمة مرور لوحة التحكم. انسخ رابط الربط الكامل من تبويب «الذكاء الاصطناعي و Claude» في صفحة admin.html.";
}

async function dbUpsert<T extends Record<string, unknown>>(
  table: AllowedTable,
  rows: T[],
  adminKey: string,
): Promise<T[]> {
  assertAllowedTable(table);
  if (!rows.length) return [];
  if (!adminKey) throw new Error(authErrorMsg());

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: dbHeaders(adminKey, "return=representation,resolution=merge-duplicates"),
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401 || res.status === 403 || /row-level security|42501/i.test(errText)) {
      throw new Error(authErrorMsg());
    }
    throw new Error(`فشل حفظ البيانات في ${table}: ${errText}`);
  }

  const saved = (await res.json()) as T[];
  if (rows.length > 0 && saved.length === 0) {
    throw new Error(authErrorMsg());
  }
  return saved;
}

async function dbUpdate<T extends Record<string, unknown>>(
  table: AllowedTable,
  id: string,
  patch: Partial<T>,
  adminKey: string,
): Promise<T> {
  assertAllowedTable(table);
  if (!adminKey) throw new Error(authErrorMsg());

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: dbHeaders(adminKey, "return=representation"),
      body: JSON.stringify(patch),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401 || res.status === 403 || /row-level security|42501/i.test(errText)) {
      throw new Error(authErrorMsg());
    }
    throw new Error(`فشل تحديث العنصر في ${table}: ${errText}`);
  }

  const rows = (await res.json()) as T[];
  if (!rows.length) {
    const chk = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id`,
      { headers: dbHeaders("") },
    );
    const existing = chk.ok ? await chk.json() : [];
    if (Array.isArray(existing) && existing.length > 0) {
      throw new Error(authErrorMsg());
    }
    throw new Error(`العنصر المطلوب (${id}) غير موجود في جدول ${table}.`);
  }
  return rows[0];
}

async function dbDelete(table: AllowedTable, id: string, adminKey: string): Promise<void> {
  assertAllowedTable(table);
  if (!adminKey) throw new Error(authErrorMsg());

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: dbHeaders(adminKey, "return=representation"),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`فشل الحذف من ${table}: ${errText}`);
  }

  const deleted = await res.json();
  if (!Array.isArray(deleted) || deleted.length === 0) {
    const chk = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id`,
      { headers: dbHeaders("") },
    );
    const existing = chk.ok ? await chk.json() : [];
    if (Array.isArray(existing) && existing.length > 0) {
      throw new Error(authErrorMsg());
    }
    throw new Error(`العنصر (${id}) غير موجود بالفعل في ${table}.`);
  }
}

function normAr(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normArNoAl(s: string): string {
  return normAr(s)
    .split(" ")
    .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w))
    .join(" ");
}

const BAC_SUBJECT_RULES: Array<{
  canonical: string;
  icon: string;
  color: string;
  keywords: string[];
}> = [
  {
    canonical: "محاسبة",
    icon: "chart",
    color: "rose",
    keywords: [
      "محاسبه", "التسيير المحاسبي والمالي", "تسيير محاسبي", "اعمال نهايه السنه", "اهتلاك",
      "الاهتلاكات", "تثبيتات", "مخزونات", "مؤونات", "خساره القيمه", "تسويه الزبائن",
      "ميزانيه وظيفيه", "حسابات النتائج", "كشوف ماليه", "قروض", "اختلالات", "scf", "comptabilite"
    ],
  },
  {
    canonical: "اقتصاد",
    icon: "chart",
    color: "sky",
    keywords: [
      "اقتصاد", "المناجمنت", "اقتصاد ومناجمنت", "النقود", "البنوك", "النظام المصرفي",
      "التضخم", "البطاله", "التجاره الخارجيه", "سعر الصرف", "السوق والاسعار", "القياده",
      "الرقابه", "التمويل", "economie", "management"
    ],
  },
  {
    canonical: "قانون",
    icon: "book",
    color: "rose",
    keywords: [
      "قانون", "عقد البيع", "عقد الشركه", "شركه المساهمه", "الشركات التجاريه",
      "علاقات العمل", "عقد العمل", "الاتفاقيات الجماعيه", "الماليه العامه", "الميزانيه العامه للدوله",
      "الضرائب والرسوم", "شركه التضامن", "مسؤوليه محدوده", "droit"
    ],
  },
  {
    canonical: "الرياضيات",
    icon: "math",
    color: "indigo",
    keywords: [
      "رياضيات", "المتتاليات", "متتاليه", "الدوال", "داله اسيه", "داله لوغاريتميه",
      "الاحتمالات", "الاعداد المركبه", "النهايات", "الاشتقاقيه", "الاستمراريه",
      "التكامل", "الدوال الاصليه", "القسمه الاقليديه", "الموافقات", "الهندسه في الفضاء", "math"
    ],
  },
  {
    canonical: "العلوم الفيزيائية",
    icon: "atom",
    color: "teal",
    keywords: [
      "فيزياء", "العلوم الفيزيائيه", "كيمياء", "المتابعه الزمنيه", "تحول كيميائي",
      "التحولات النوويه", "الظواهر الكهربائيه", "ثنائي القطب", "الاحماض والاسس",
      "تطور جمله ميكانيكيه", "نيوتن", "الاقمار الصناعيه", "السقوط الشاقولي", "الاستره", "اهتزازات", "physique"
    ],
  },
  {
    canonical: "علوم الطبيعة والحياة",
    icon: "dna",
    color: "green",
    keywords: [
      "علوم الطبيعه", "علوم طبيعيه", "تركيب البروتين", "الاستنساخ", "الترجمه",
      "الانزيمات", "المناعه", "الدفاع عن الذات", "الاتصال العصبي", "المشبك",
      "التركيب الضوئي", "التنفس والتخمر", "الجيولوجيا", "التكتونيه"
    ],
  },
  {
    canonical: "الفلسفة",
    icon: "bulb",
    color: "purple",
    keywords: [
      "فلسفه", "مقاله فلسفيه", "جدليه", "استقصاء بالوضع", "استقصاء بالرفع", "تحليل نص فلسفي",
      "الاحساس والادراك", "اللغه والفكر", "الذاكره والخيال", "العاده والاراده",
      "الاخلاق الموضوعيه", "الحق والواجب", "فلسفه الرياضيات", "العلوم الانسانيه", "الشعور واللاشعور"
    ],
  },
  {
    canonical: "اللغة العربية",
    icon: "book-open",
    color: "amber",
    keywords: [
      "لغه عربيه", "ادب عربي", "البناء الفكري", "البناء اللغوي", "التقويم النقدي",
      "شعر المنفي", "شعر المهجر", "الرومانسيه", "الشعر السياسي", "القضيه الفلسطينيه",
      "الثوره الجزائريه في الشعر", "المقال", "اعراب الجمل", "المسند والمسند اليه", "البلاغه"
    ],
  },
  {
    canonical: "اللغة الفرنسية",
    icon: "fr",
    color: "blue",
    keywords: [
      "لغه فرنسيه", "فرنسيه", "francais", "texte historique", "texte argumentatif",
      "texte exhortatif", "l appel", "compte rendu", "production ecrite", "bac francais"
    ],
  },
  {
    canonical: "اللغة الإنجليزية",
    icon: "gb",
    color: "sky",
    keywords: [
      "لغه انجليزيه", "انجليزيه", "english", "ethics in business", "ill gotten gains",
      "safety first", "ancient civilizations", "education in the world", "astronomy",
      "feelings and emotions", "bac english"
    ],
  },
  {
    canonical: "التاريخ والجغرافيا",
    icon: "globe",
    color: "rose",
    keywords: [
      "تاريخ وجغرافيا", "التاريخ", "الجغرافيا", "الحرب البارده", "الثنائيه القطبيه",
      "التعايش السلمي", "الانفراج الدولي", "الثوره التحريريه", "استعاده السياده",
      "التقدم والتخلف", "المبادلات والتنقلات", "الولايات المتحده", "الاتحاد الاوروبي", "شرق وجنوب شرق اسيا"
    ],
  },
  {
    canonical: "العلوم الإسلامية",
    icon: "mosque",
    color: "emerald",
    keywords: [
      "علوم اسلاميه", "شريعه اسلاميه", "الشريعه", "العقيده الاسلاميه", "مقاصد الشريعه",
      "العقل في القران", "الربا واحكامه", "الميراث", "الاجماع", "القياس", "المصالح المرسله",
      "الوقف في الاسلام", "الجرائم والعقوبات", "خطبه حجه الوداع", "الرسالات السماويه"
    ],
  },
];

function detectSubjectFromText(corpus: string): {
  name: string;
  icon: string;
  color: string;
  keywords_matched: string[];
} | null {
  const norm = normAr(corpus);
  let best: { rule: (typeof BAC_SUBJECT_RULES)[0]; score: number; matched: string[] } | null = null;

  for (const rule of BAC_SUBJECT_RULES) {
    let score = 0;
    const matched: string[] = [];
    for (const kw of rule.keywords) {
      const nkw = normAr(kw);
      if (nkw && norm.includes(nkw)) {
        score += nkw.includes(" ") ? 3 : 2;
        matched.push(kw);
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { rule, score, matched };
    }
  }
  if (!best) return null;
  return {
    name: best.rule.canonical,
    icon: best.rule.icon,
    color: best.rule.color,
    keywords_matched: best.matched.slice(0, 6),
  };
}

function findMatchingSubject(subjects: SubjectRow[], nameOrId: string): SubjectRow | null {
  if (!nameOrId) return null;
  const raw = nameOrId.trim();
  const byId = subjects.find((s) => s.id === raw);
  if (byId) return byId;

  const target = normArNoAl(raw);
  if (!target) return null;

  for (const s of subjects) {
    const sn = normArNoAl(s.name);
    if (sn === target || (sn.length >= 4 && target.includes(sn)) || (target.length >= 4 && sn.includes(target))) {
      return s;
    }
  }

  const detected = detectSubjectFromText(raw);
  if (detected) {
    const dn = normArNoAl(detected.name);
    for (const s of subjects) {
      const sn = normArNoAl(s.name);
      if (sn === dn || sn.includes(dn) || dn.includes(sn)) return s;
    }
  }
  return null;
}

function analyzeVideoTitle(rawTitle: string): {
  cleaned_title: string;
  is_exercise_hint: boolean;
  unit_hint: string | null;
  base_lesson_title: string;
  part_label: string | null;
} {
  let cleaned = String(rawTitle || "")
    .replace(/#\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = cleaned
    .replace(/\s*[|\-–—]\s*(?:بكالوريا|باك|bac)\s*20\d{2}[^|\-–—]*$/gi, "")
    .replace(/\s*\(\s*(?:بكالوريا|باك|bac)\s*20\d{2}[^)]*\)\s*$/gi, "")
    .replace(/\s*[|\-–—]\s*(?:الأستاذ|الاستاذ|أستاذ|استاذ|prof\.?)\s+[^|\-–—]+$/gi, "")
    .trim();
  if (!cleaned) cleaned = String(rawTitle || "فيديو").trim();

  const norm = normAr(cleaned);
  const isExercise =
    /(?:^|\s)(?:تمرين|تمارين|تطبيق|تطبيقات|سلسله تمارين|حل تمرين|حلول تمارين|حل موضوع|حل بكالوريا|موضوع مقترح|مواضيع مقترحه|فرض|اختبار|exercice|exercices|sujet bac|corrig[eé])(?:\s|$|\d)/i.test(
      norm,
    ) && !/(?:^|\s)(?:ملخص شامل|شرح الدرس)(?:\s|$)/.test(norm);

  let unitHint: string | null = null;
  const unitRegex =
    /(?:^|[|\-–—()])\s*((?:الوحدة|الوحده|المجال(?:\s+التعلمي)?|المحور|Chapitre|Unit)\s*(?:رقم\s*)?(?:\d+|الأولى|الاولى|الأول|الاول|الثانية|الثانيه|الثاني|الثالثة|الثالثه|الثالث|الرابعة|الرابعه|الرابع|الخامسة|الخامسه|الخامس|السادسة|السادسه|السادس)(?:\s*[:\-–]\s*[^|\-–—()]{2,38})?)/i;
  const um = cleaned.match(unitRegex);
  if (um && um[1]) {
    unitHint = um[1].trim();
  }

  let partLabel: string | null = null;
  let baseTitle = cleaned;

  const partPatterns: RegExp[] = [
    /\s*[\(\[|\-–—]?\s*((?:الجزء|جزء|الشطر|شطر|Part|Partie)\s*(?:\d+|الأول|الاول|الثاني|الثالث|الرابع|الخامس))\s*[\)\]]?\s*$/i,
    /\s*[\(\[]\s*(ج\s*\d+|\d+\s*\/\s*\d+)\s*[\)\]]\s*$/i,
  ];
  for (const rx of partPatterns) {
    const pm = baseTitle.match(rx);
    if (pm && pm[1]) {
      partLabel = pm[1].trim();
      const stripped = baseTitle.slice(0, pm.index).replace(/[\s:\-–—|]+$/, "").trim();
      if (stripped.length >= 4) baseTitle = stripped;
      break;
    }
  }

  return {
    cleaned_title: cleaned,
    is_exercise_hint: isExercise,
    unit_hint: unitHint,
    base_lesson_title: baseTitle,
    part_label: partLabel,
  };
}

function parseYouTubeIdentifiers(input: string): { playlistId: string | null; videoId: string | null } {
  const raw = String(input || "").trim();
  if (!raw) return { playlistId: null, videoId: null };

  if (/^(PL|OLAK5uy_|UU|FL|RD|VL)[A-Za-z0-9_-]{8,}$/.test(raw)) {
    return {
      playlistId: raw.startsWith("VL") ? raw.slice(2) : raw,
      videoId: null,
    };
  }

  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const list = u.searchParams.get("list");
    let v = u.searchParams.get("v");
    if (!v && u.hostname.includes("youtu.be")) {
      v = u.pathname.split("/").filter(Boolean)[0] || null;
    }
    if (!v) {
      const m = u.pathname.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/);
      if (m) v = m[1];
    }
    return {
      playlistId: list ? (list.startsWith("VL") ? list.slice(2) : list) : null,
      videoId: v || null,
    };
  } catch {
    const listMatch = raw.match(/[?&]list=([A-Za-z0-9_-]+)/);
    const vidMatch = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
    return {
      playlistId: listMatch ? listMatch[1] : null,
      videoId: vidMatch ? vidMatch[1] : null,
    };
  }
}

const YT_SKIP_TITLES = new Set([
  "[private video]",
  "[deleted video]",
  "private video",
  "deleted video",
  "فيديو خاص",
  "فيديو محذوف",
]);

function extractFromInnerTubeTree(
  root: unknown,
  seen: Set<string>,
  outVideos: Array<{ videoId: string; title: string; duration: string; author: string }>,
  continuations: string[],
  meta: { title?: string; author?: string },
): void {
  if (!root || typeof root !== "object") return;
  if (Array.isArray(root)) {
    for (const item of root) extractFromInnerTubeTree(item, seen, outVideos, continuations, meta);
    return;
  }

  const obj = root as Record<string, unknown>;

  if (!meta.title && obj.playlistMetadataRenderer && typeof obj.playlistMetadataRenderer === "object") {
    const pm = obj.playlistMetadataRenderer as Record<string, unknown>;
    if (typeof pm.title === "string" && pm.title.trim()) meta.title = pm.title.trim();
  }
  if (!meta.title && obj.playlistHeaderRenderer && typeof obj.playlistHeaderRenderer === "object") {
    const ph = obj.playlistHeaderRenderer as Record<string, any>;
    const t = ph.title?.simpleText || ph.title?.runs?.map((r: any) => r.text).join("");
    if (t) meta.title = String(t).trim();
    const ow = ph.ownerText?.runs?.map((r: any) => r.text).join("");
    if (ow && !meta.author) meta.author = String(ow).trim();
  }
  if (!meta.title && obj.pageHeaderRenderer && typeof obj.pageHeaderRenderer === "object") {
    const phr = obj.pageHeaderRenderer as Record<string, any>;
    if (typeof phr.pageTitle === "string" && phr.pageTitle.trim()) {
      meta.title = phr.pageTitle.trim();
    }
  }

  if (obj.playlistVideoRenderer && typeof obj.playlistVideoRenderer === "object") {
    const pv = obj.playlistVideoRenderer as Record<string, any>;
    const vid = typeof pv.videoId === "string" ? pv.videoId : "";
    const title =
      pv.title?.runs?.map((r: any) => r.text).join("") ||
      pv.title?.simpleText ||
      "";
    const duration =
      pv.lengthText?.simpleText ||
      pv.lengthText?.runs?.map((r: any) => r.text).join("") ||
      "";
    const author =
      pv.shortBylineText?.runs?.map((r: any) => r.text).join("") || "";

    const normT = String(title).trim().toLowerCase();
    if (vid && title && !YT_SKIP_TITLES.has(normT) && pv.isPlayable !== false && !seen.has(vid)) {
      seen.add(vid);
      if (author && !meta.author) meta.author = author;
      outVideos.push({
        videoId: vid,
        title: String(title).trim(),
        duration: String(duration).trim(),
        author: String(author).trim(),
      });
    }
    return;
  }

  if (obj.lockupViewModel && typeof obj.lockupViewModel === "object") {
    const lv = obj.lockupViewModel as Record<string, any>;
    const vid = typeof lv.contentId === "string" && lv.contentId.length === 11 ? lv.contentId : "";
    const title = lv.metadata?.lockupMetadataViewModel?.title?.content || "";
    const normT = String(title).trim().toLowerCase();
    if (vid && title && !YT_SKIP_TITLES.has(normT) && !seen.has(vid)) {
      seen.add(vid);
      outVideos.push({
        videoId: vid,
        title: String(title).trim(),
        duration: "",
        author: meta.author || "",
      });
    }
  }

  if (obj.continuationItemRenderer && typeof obj.continuationItemRenderer === "object") {
    const ci = obj.continuationItemRenderer as Record<string, any>;
    const token =
      ci.continuationEndpoint?.continuationCommand?.token ||
      ci.continuationEndpoint?.commandExecutorCommand?.commands?.find(
        (c: any) => c?.continuationCommand?.token,
      )?.continuationCommand?.token;
    if (typeof token === "string" && token) continuations.push(token);
  }

  for (const val of Object.values(obj)) {
    extractFromInnerTubeTree(val, seen, outVideos, continuations, meta);
  }
}

async function fetchYouTubePlaylistViaInnerTube(
  playlistId: string,
  maxVideos: number,
): Promise<{ title: string; author: string; videos: Array<{ videoId: string; title: string; duration: string }> }> {
  const clientCtx = {
    client: {
      hl: "ar",
      gl: "DZ",
      clientName: "WEB",
      clientVersion: "2.20250301.01.00",
    },
  };

  const ytHeaders = {
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "ar,fr;q=0.9,en;q=0.8",
    Cookie: "SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb",
  };

  const seen = new Set<string>();
  const rawVideos: Array<{ videoId: string; title: string; duration: string; author: string }> = [];
  const meta: { title?: string; author?: string } = {};

  const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
  const firstRes = await fetch("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
    method: "POST",
    headers: ytHeaders,
    body: JSON.stringify({ browseId, context: clientCtx }),
  });

  let nextTokens: string[] = [];
  if (firstRes.ok) {
    const data = await firstRes.json();
    extractFromInnerTubeTree(data, seen, rawVideos, nextTokens, meta);
  }

  let pageGuard = 0;
  while (nextTokens.length > 0 && rawVideos.length < maxVideos && pageGuard < 5) {
    pageGuard++;
    const token = nextTokens.shift()!;
    nextTokens = [];
    const contRes = await fetch("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
      method: "POST",
      headers: ytHeaders,
      body: JSON.stringify({ continuation: token, context: clientCtx }),
    });
    if (!contRes.ok) break;
    const contData = await contRes.json();
    extractFromInnerTubeTree(contData, seen, rawVideos, nextTokens, meta);
  }

  if (rawVideos.length === 0) {
    const htmlRes = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}&hl=ar`, {
      headers: {
        "User-Agent": ytHeaders["User-Agent"],
        "Accept-Language": ytHeaders["Accept-Language"],
        Cookie: ytHeaders.Cookie,
      },
    });
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const m = html.match(/var\s+ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
      if (m && m[1]) {
        try {
          const parsed = JSON.parse(m[1]);
          extractFromInnerTubeTree(parsed, seen, rawVideos, [], meta);
        } catch {
          // fallback
        }
      }
    }
  }

  if (rawVideos.length === 0) {
    const xmlRes = await fetch(
      `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`,
    );
    if (xmlRes.ok) {
      const xml = await xmlRes.text();
      const feedTitleMatch = xml.match(/<title>([^<]+)<\/title>/);
      if (feedTitleMatch && !meta.title) meta.title = decodeXmlEntities(feedTitleMatch[1]);
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let em: RegExpExecArray | null;
      while ((em = entryRegex.exec(xml)) !== null && rawVideos.length < maxVideos) {
        const block = em[1];
        const vid = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim() || "";
        const vt = decodeXmlEntities(block.match(/<title>([^<]+)<\/title>/)?.[1] || "");
        const au = decodeXmlEntities(block.match(/<name>([^<]+)<\/name>/)?.[1] || "");
        if (vid && vt && !seen.has(vid)) {
          seen.add(vid);
          if (au && !meta.author) meta.author = au;
          rawVideos.push({ videoId: vid, title: vt, duration: "", author: au });
        }
      }
    }
  }

  return {
    title: meta.title || "قائمة تشغيل يوتيوب",
    author: meta.author || "",
    videos: rawVideos.slice(0, maxVideos).map((v) => ({
      videoId: v.videoId,
      title: v.title,
      duration: v.duration,
    })),
  };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function extractYouTubePlaylistOrVideo(urlInput: string, maxVideos = 200): Promise<ExtractedPlaylist> {
  const { playlistId, videoId } = parseYouTubeIdentifiers(urlInput);

  if (!playlistId && !videoId) {
    throw new Error(
      "لم يتم التعرف على رابط قائمة تشغيل أو فيديو يوتيوب صالح. تأكد من أن الرابط يحتوي على list=... أو رابط فيديو يوتيوب.",
    );
  }

  if (!playlistId && videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let title = "درس فيديو";
    let author = "";
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
    );
    if (oembed.ok) {
      const oj = await oembed.json();
      title = oj.title || title;
      author = oj.author_name || "";
    }
    const an = analyzeVideoTitle(title);
    const detected = detectSubjectFromText(`${title} ${author}`);
    return {
      playlist_id: null,
      title: an.cleaned_title,
      author,
      source_url: watchUrl,
      video_count: 1,
      detected_subject_hint: detected,
      videos: [
        {
          index: 1,
          video_id: videoId,
          title,
          cleaned_title: an.cleaned_title,
          url: watchUrl,
          duration: "",
          is_exercise_hint: an.is_exercise_hint,
          unit_hint: an.unit_hint,
          base_lesson_title: an.base_lesson_title,
          part_label: an.part_label,
        },
      ],
    };
  }

  const pl = await fetchYouTubePlaylistViaInnerTube(playlistId!, Math.min(Math.max(maxVideos, 1), 400));
  if (!pl.videos.length) {
    throw new Error(
      "تعذّر استخراج فيديوهات من هذه القائمة. تأكد من أن قائمة التشغيل في يوتيوب «علنية (Public)» أو «غير مدرجة (Unlisted)» وليست خاصة.",
    );
  }

  const items: PlaylistVideoItem[] = pl.videos.map((v, i) => {
    const an = analyzeVideoTitle(v.title);
    return {
      index: i + 1,
      video_id: v.videoId,
      title: v.title,
      cleaned_title: an.cleaned_title,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      duration: v.duration,
      is_exercise_hint: an.is_exercise_hint,
      unit_hint: an.unit_hint,
      base_lesson_title: an.base_lesson_title,
      part_label: an.part_label,
    };
  });

  const sampleText = `${pl.title} ${pl.author} ` + items.slice(0, 25).map((x) => x.title).join(" ");
  const detected = detectSubjectFromText(sampleText);

  return {
    playlist_id: playlistId,
    title: pl.title,
    author: pl.author,
    source_url: `https://www.youtube.com/playlist?list=${playlistId}`,
    video_count: items.length,
    detected_subject_hint: detected,
    videos: items,
  };
}

interface PlanResourceInput {
  title: string;
  url: string;
  exercise_type?: "video" | "pdf" | "image" | "link";
  group_id?: string;
  group_title?: string;
}
interface PlanLessonInput {
  id?: string;
  title: string;
  item_type?: "lesson" | "exercise";
  videos?: PlanResourceInput[];
  exercises?: PlanResourceInput[];
  pdfs?: PlanResourceInput[];
  images?: PlanResourceInput[];
}
interface PlanUnitInput {
  id?: string;
  title: string;
  lessons: PlanLessonInput[];
}
interface CurriculumPlan {
  subject: {
    id?: string;
    name: string;
    icon?: string;
    color?: string;
  };
  units: PlanUnitInput[];
  skip_duplicate_urls?: boolean;
}

function buildSmartCurriculumPlan(
  playlist: ExtractedPlaylist,
  siteData: SiteData,
  opts: {
    subjectNameOrId?: string;
    unitTitleOrId?: string;
    groupingMode?: "smart" | "per_video" | "single_lesson" | "unit_exercises";
    separateExercises?: boolean;
  } = {},
): CurriculumPlan {
  const grouping = opts.groupingMode || "smart";
  const separateExercises = opts.separateExercises !== false;

  let subjectEntry: CurriculumPlan["subject"];
  const requestedSubj = (opts.subjectNameOrId || "").trim();
  const matchedSubj = requestedSubj
    ? findMatchingSubject(siteData.subjects, requestedSubj)
    : playlist.detected_subject_hint
    ? findMatchingSubject(siteData.subjects, playlist.detected_subject_hint.name)
    : null;

  if (matchedSubj) {
    subjectEntry = {
      id: matchedSubj.id,
      name: matchedSubj.name,
      icon: matchedSubj.icon,
      color: matchedSubj.color,
    };
  } else if (requestedSubj) {
    const det = detectSubjectFromText(requestedSubj);
    subjectEntry = {
      name: requestedSubj,
      icon: det?.icon || "book",
      color: det?.color || "indigo",
    };
  } else if (playlist.detected_subject_hint) {
    subjectEntry = {
      name: playlist.detected_subject_hint.name,
      icon: playlist.detected_subject_hint.icon,
      color: playlist.detected_subject_hint.color,
    };
  } else {
    const firstExisting = siteData.subjects[0];
    subjectEntry = firstExisting
      ? { id: firstExisting.id, name: firstExisting.name, icon: firstExisting.icon, color: firstExisting.color }
      : { name: "مادة عامة", icon: "book", color: "indigo" };
  }

  const defaultUnitTitle =
    analyzeVideoTitle(playlist.title).cleaned_title || playlist.title || "وحدة دراسية";

  const existingUnits = subjectEntry.id
    ? siteData.units.filter((u) => u.subject_id === subjectEntry.id)
    : [];
  let fixedUnit: { id?: string; title: string } | null = null;
  if (opts.unitTitleOrId && opts.unitTitleOrId.trim()) {
    const rawU = opts.unitTitleOrId.trim();
    const uById = existingUnits.find((u) => u.id === rawU);
    const uByTitle = existingUnits.find((u) => normArNoAl(u.title) === normArNoAl(rawU));
    if (uById) fixedUnit = { id: uById.id, title: uById.title };
    else if (uByTitle) fixedUnit = { id: uByTitle.id, title: uByTitle.title };
    else fixedUnit = { title: rawU };
  }

  if (grouping === "single_lesson") {
    const targetUnit = fixedUnit || { title: defaultUnitTitle };
    const videos: PlanResourceInput[] = [];
    const exercises: PlanResourceInput[] = [];
    for (const v of playlist.videos) {
      if (separateExercises && v.is_exercise_hint) {
        exercises.push({ title: v.cleaned_title, url: v.url, exercise_type: "video" });
      } else {
        videos.push({ title: v.cleaned_title, url: v.url });
      }
    }
    return {
      subject: subjectEntry,
      units: [
        {
          ...targetUnit,
          lessons: [
            {
              title: defaultUnitTitle,
              videos,
              exercises,
            },
          ],
        },
      ],
      skip_duplicate_urls: true,
    };
  }

  const unitsMap = new Map<string, PlanUnitInput>();
  const getOrCreateUnit = (unitTitle: string, unitId?: string): PlanUnitInput => {
    const key = unitId || normArNoAl(unitTitle) || "default";
    if (!unitsMap.has(key)) {
      const matchedU = !unitId
        ? existingUnits.find((u) => normArNoAl(u.title) === normArNoAl(unitTitle))
        : existingUnits.find((u) => u.id === unitId);
      unitsMap.set(key, {
        id: matchedU?.id || unitId,
        title: matchedU?.title || unitTitle,
        lessons: [],
      });
    }
    return unitsMap.get(key)!;
  };

  let currentUnitTitle = fixedUnit?.title || defaultUnitTitle;
  let lastLesson: PlanLessonInput | null = null;
  let lastLessonNormBase = "";

  for (const v of playlist.videos) {
    if (!fixedUnit && v.unit_hint) {
      currentUnitTitle = v.unit_hint;
    }
    const unitObj = getOrCreateUnit(currentUnitTitle, fixedUnit?.id);

    if (grouping === "unit_exercises") {
      unitObj.lessons.push({
        title: v.cleaned_title,
        item_type: "exercise",
        videos: [{ title: v.cleaned_title, url: v.url }],
        exercises: [],
      });
      continue;
    }

    if (separateExercises && v.is_exercise_hint && grouping === "smart") {
      if (!lastLesson || !unitObj.lessons.includes(lastLesson)) {
        let exLesson = unitObj.lessons.find((l) => l.title === "تمارين وتطبيقات شاملة");
        if (!exLesson) {
          exLesson = { title: "تمارين وتطبيقات شاملة", videos: [], exercises: [] };
          unitObj.lessons.push(exLesson);
        }
        exLesson.exercises = exLesson.exercises || [];
        exLesson.exercises.push({ title: v.cleaned_title, url: v.url, exercise_type: "video" });
      } else {
        lastLesson.exercises = lastLesson.exercises || [];
        lastLesson.exercises.push({ title: v.cleaned_title, url: v.url, exercise_type: "video" });
      }
      continue;
    }

    const normBase = normArNoAl(v.base_lesson_title);
    const shouldMergeIntoPrevLesson =
      grouping === "smart" &&
      lastLesson &&
      unitObj.lessons.includes(lastLesson) &&
      normBase.length >= 5 &&
      normBase === lastLessonNormBase;

    if (shouldMergeIntoPrevLesson && lastLesson) {
      lastLesson.videos = lastLesson.videos || [];
      lastLesson.videos.push({ title: v.cleaned_title, url: v.url });
    } else {
      const lessonTitle = grouping === "smart" && v.part_label ? v.base_lesson_title : v.cleaned_title;
      const newLesson: PlanLessonInput = {
        title: lessonTitle,
        videos: separateExercises && v.is_exercise_hint ? [] : [{ title: v.cleaned_title, url: v.url }],
        exercises:
          separateExercises && v.is_exercise_hint
            ? [{ title: v.cleaned_title, url: v.url, exercise_type: "video" }]
            : [],
      };
      unitObj.lessons.push(newLesson);
      lastLesson = newLesson;
      lastLessonNormBase = normBase;
    }
  }

  return {
    subject: subjectEntry,
    units: Array.from(unitsMap.values()).filter((u) => u.lessons.length > 0),
    skip_duplicate_urls: true,
  };
}

async function executeCurriculumPlan(plan: CurriculumPlan, adminKey: string) {
  const siteData = await dbSelectAll();
  const skipDuplicates = plan.skip_duplicate_urls !== false;

  let subject =
    (plan.subject.id ? siteData.subjects.find((s) => s.id === plan.subject.id) : null) ||
    findMatchingSubject(siteData.subjects, plan.subject.name);

  let createdSubject = false;
  if (!subject) {
    const det = detectSubjectFromText(plan.subject.name);
    const maxOrder = siteData.subjects.reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
    subject = {
      id: uid("s"),
      name: plan.subject.name.trim(),
      icon: plan.subject.icon || det?.icon || "book",
      color: plan.subject.color || det?.color || "indigo",
      sort_order: maxOrder + 1,
    };
    await dbUpsert("subjects", [subject], adminKey);
    createdSubject = true;
  }

  const unitsToUpsert: UnitRow[] = [];
  const lessonsToUpsert: LessonRow[] = [];
  const resourcesToUpsert: ResourceRow[] = [];

  const existingUnits = siteData.units.filter((u) => u.subject_id === subject!.id);
  let nextUnitOrder = existingUnits.reduce((m, u) => Math.max(m, u.sort_order || 0), 0);

  const seenUrlsByLesson = new Map<string, Set<string>>();
  const nextOrderByLesson = new Map<string, number>();

  let createdUnitsCount = 0;
  let reusedUnitsCount = 0;
  let createdLessonsCount = 0;
  let reusedLessonsCount = 0;
  let addedVideosCount = 0;
  let addedExercisesCount = 0;
  let addedOtherCount = 0;
  let skippedDuplicatesCount = 0;

  for (const uPlan of plan.units || []) {
    if (!uPlan.title && !uPlan.id) continue;
    let unit =
      (uPlan.id ? existingUnits.find((u) => u.id === uPlan.id) : null) ||
      existingUnits.find((u) => normArNoAl(u.title) === normArNoAl(uPlan.title));

    if (!unit) {
      nextUnitOrder += 1;
      unit = {
        id: uid("u"),
        subject_id: subject.id,
        title: uPlan.title.trim(),
        sort_order: nextUnitOrder,
      };
      existingUnits.push(unit);
      unitsToUpsert.push(unit);
      createdUnitsCount++;
    } else {
      reusedUnitsCount++;
    }

    const existingLessons = siteData.lessons.filter((l) => l.unit_id === unit!.id);
    for (const pushedL of lessonsToUpsert) {
      if (pushedL.unit_id === unit.id && !existingLessons.some((x) => x.id === pushedL.id)) {
        existingLessons.push(pushedL);
      }
    }
    let nextLessonOrder = existingLessons.reduce((m, l) => Math.max(m, l.sort_order || 0), 0);

    for (const lPlan of uPlan.lessons || []) {
      if (!lPlan.title && !lPlan.id) continue;
      const targetType = lPlan.item_type === "exercise" ? "exercise" : "lesson";
      const isRowEx = (row: LessonRow) => row.item_type === "exercise" || row.id.startsWith("ex-");
      const sameTypeLessons = existingLessons.filter((l) => (targetType === "exercise" ? isRowEx(l) : !isRowEx(l)));

      let lesson =
        (lPlan.id ? existingLessons.find((l) => l.id === lPlan.id) : null) ||
        sameTypeLessons.find((l) => normArNoAl(l.title) === normArNoAl(lPlan.title));

      if (!lesson) {
        nextLessonOrder += 1;
        lesson = {
          id: uid(targetType === "exercise" ? "ex" : "l"),
          unit_id: unit.id,
          title: lPlan.title.trim(),
          item_type: targetType,
          sort_order: nextLessonOrder,
        };
        existingLessons.push(lesson);
        lessonsToUpsert.push(lesson);
        createdLessonsCount++;
      } else {
        reusedLessonsCount++;
      }

      if (!seenUrlsByLesson.has(lesson.id)) {
        const existingLessonRes = siteData.resources.filter((r) => r.lesson_id === lesson!.id);
        seenUrlsByLesson.set(lesson.id, new Set(existingLessonRes.map((r) => r.url.trim())));
        nextOrderByLesson.set(
          lesson.id,
          existingLessonRes.reduce((m, r) => Math.max(m, r.sort_order || 0), 0),
        );
      }
      const existingUrls = seenUrlsByLesson.get(lesson.id)!;

      const pushResource = (
        kind: "video" | "exercise" | "pdf" | "image",
        item: PlanResourceInput,
      ) => {
        const cleanUrl = String(item.url || "").trim();
        if (!cleanUrl) return;
        if (skipDuplicates && existingUrls.has(cleanUrl)) {
          skippedDuplicatesCount++;
          return;
        }
        existingUrls.add(cleanUrl);
        const ord = (nextOrderByLesson.get(lesson!.id) || 0) + 1;
        nextOrderByLesson.set(lesson!.id, ord);
        const rTitle = (item.title || lesson!.title || "محتوى").trim();
        resourcesToUpsert.push({
          id: uid("r"),
          lesson_id: lesson!.id,
          kind,
          title: rTitle,
          url: cleanUrl,
          size: null,
          exercise_type: kind === "exercise" ? item.exercise_type || "video" : null,
          group_id: item.group_id || null,
          group_title: item.group_title || null,
          sort_order: ord,
        });
        if (kind === "video") addedVideosCount++;
        else if (kind === "exercise") addedExercisesCount++;
        else addedOtherCount++;
      };

      for (const v of lPlan.videos || []) pushResource("video", v);
      for (const ex of lPlan.exercises || []) pushResource("exercise", ex);
      for (const pdf of lPlan.pdfs || []) pushResource("pdf", pdf);
      for (const img of lPlan.images || []) pushResource("image", img);
    }
  }

  if (unitsToUpsert.length) await dbUpsert("units", unitsToUpsert, adminKey);
  if (lessonsToUpsert.length) await dbUpsert("lessons", lessonsToUpsert, adminKey);
  if (resourcesToUpsert.length) await dbUpsert("resources", resourcesToUpsert, adminKey);

  return {
    ok: true,
    subject: { id: subject.id, name: subject.name, created: createdSubject },
    stats: {
      units_created: createdUnitsCount,
      units_reused: reusedUnitsCount,
      lessons_created: createdLessonsCount,
      lessons_reused: reusedLessonsCount,
      videos_added: addedVideosCount,
      exercises_added: addedExercisesCount,
      other_resources_added: addedOtherCount,
      duplicates_skipped: skippedDuplicatesCount,
    },
    links: {
      subject_page: `https://taharbn12.github.io/Bac/subject.html?subject=${encodeURIComponent(subject.id)}`,
      admin_page: `https://taharbn12.github.io/Bac/admin.html`,
    },
  };
}

const MCP_TOOLS = [
  {
    name: "get_site_structure",
    description:
      "جلب الهيكل الكامل لموقع آية باك 2027 (المواد الدراسية، الوحدات، الدروس، تمارين الوحدات، وإحصائيات أو تفاصيل الفيديوهات والملفات والتمارين).",
    inputSchema: {
      type: "object",
      properties: {
        subject_id: {
          type: "string",
          description: "معرف مادة محددة للتصفية (اختياري، مثل s-math).",
        },
        include_resources: {
          type: "boolean",
          description: "إرجاع تفاصيل روابط الفيديوهات والملفات والتمارين داخل كل درس أو تمرين.",
        },
      },
    },
  },
  {
    name: "fetch_youtube_playlist",
    description:
      "استخراج جميع فيديوهات قائمة تشغيل يوتيوب أو فيديو يوتيوب من الرابط مع تلميحات ذكية للمادة والوحدة وفصل التمارين عن الدروس.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "رابط قائمة تشغيل يوتيوب أو رابط فيديو.",
        },
        max_videos: {
          type: "number",
          description: "الحد الأقصى لعدد الفيديوهات المستخرجة (افتراضي: 200).",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "apply_curriculum_plan",
    description:
      "إضافة أو دمج محتوى منظم حسب المادة ← الوحدات ← الدروس أو تمارين الوحدة ← (فيديوهات + التمارين + ملفات PDF + الصور).",
    inputSchema: {
      type: "object",
      properties: {
        subject: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            icon: { type: "string" },
            color: { type: "string" },
          },
          required: ["name"],
        },
        units: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              lessons: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    item_type: { type: "string", enum: ["lesson", "exercise"] },
                    videos: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { title: { type: "string" }, url: { type: "string" }, group_id: { type: "string" }, group_title: { type: "string" } },
                        required: ["title", "url"],
                      },
                    },
                    exercises: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          url: { type: "string" },
                          exercise_type: { type: "string", enum: ["video", "pdf", "image", "link"] },
                          group_id: { type: "string" },
                          group_title: { type: "string" },
                        },
                        required: ["title", "url"],
                      },
                    },
                    pdfs: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { title: { type: "string" }, url: { type: "string" }, group_id: { type: "string" }, group_title: { type: "string" } },
                        required: ["title", "url"],
                      },
                    },
                    images: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { title: { type: "string" }, url: { type: "string" }, group_id: { type: "string" }, group_title: { type: "string" } },
                        required: ["title", "url"],
                      },
                    },
                  },
                  required: ["title"],
                },
              },
            },
            required: ["title", "lessons"],
          },
        },
        skip_duplicate_urls: { type: "boolean" },
      },
      required: ["subject", "units"],
    },
  },
  {
    name: "quick_import_youtube_playlist",
    description:
      "استيراد سريع بخطوة واحدة لقائمة تشغيل يوتيوب وتقسيمها تلقائياً إلى مادة ووحدات ودروس أو تمارين.",
    inputSchema: {
      type: "object",
      properties: {
        playlist_url: { type: "string" },
        subject_name_or_id: { type: "string" },
        unit_title_or_id: { type: "string" },
        grouping_mode: {
          type: "string",
          enum: ["smart", "per_video", "unit_exercises", "single_lesson"],
        },
        separate_exercises: { type: "boolean" },
      },
      required: ["playlist_url"],
    },
  },
  {
    name: "manage_subject",
    description: "إدارة المواد الدراسية: create / update / delete.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "update", "delete"] },
        id: { type: "string" },
        name: { type: "string" },
        icon: { type: "string" },
        color: { type: "string" },
        sort_order: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "manage_unit",
    description: "إدارة الوحدات الدراسية: create / update / delete.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "update", "delete"] },
        id: { type: "string" },
        subject_id: { type: "string" },
        title: { type: "string" },
        sort_order: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "manage_lesson",
    description: "إدارة الدروس أو تمارين الوحدة المستقلة: create / update / delete (مع item_type = lesson أو exercise).",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "update", "delete"] },
        id: { type: "string" },
        unit_id: { type: "string" },
        title: { type: "string" },
        item_type: { type: "string", enum: ["lesson", "exercise"] },
        sort_order: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "manage_resource",
    description: "إدارة محتوى الدرس أو التمرين المستقل (فيديو، ملخص PDF، صورة، أو تمرين مرفق): يدعم إضافة عنصر مفرد عبر url أو مجموعة ديناميكية (عنوان + عدة صور/فيديوهات/ملفات PDF) عبر مصفوفة urls، كما يدعم النسخ التلقائي لجميع دروس الوحدة عبر copy_to_all_unit_lessons.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "update", "delete"] },
        id: { type: "string" },
        lesson_id: { type: "string" },
        kind: { type: "string", enum: ["video", "pdf", "image", "exercise"] },
        title: { type: "string", description: "عنوان الفقرة / المجموعة أو العنصر." },
        group_id: { type: "string", description: "اختياري: معرف مجموعة موجودة لإلحاق عناصر إضافية تحت نفس العنوان." },
        group_title: { type: "string", description: "اختياري: عنوان المجموعة الديناميكية." },
        url: { type: "string", description: "رابط مفرد." },
        urls: { type: "array", items: { type: "string" }, description: "مصفوفة روابط لإضافة عدة صور أو فيديوهات أو ملفات PDF تحت نفس العنوان." },
        exercise_type: { type: "string", enum: ["video", "pdf", "image", "link"] },
        copy_to_all_unit_lessons: { type: "boolean" },
        sort_order: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "copy_resource_to_unit_lessons",
    description: "نسخ مورد موجود، أو مجموعة كاملة (group_id)، أو تمرين مستقل كامل من صفحة التمارين (exercise_id)، أو مزامنة جميع تمارين الوحدة المستقلة (sync_unit_exercises=true) إلى قسم التمارين والتطبيقات في جميع دروس الوحدة.",
    inputSchema: {
      type: "object",
      properties: {
        resource_id: { type: "string" },
        group_id: { type: "string" },
        exercise_id: { type: "string", description: "معرف التمرين المستقل (ex-...) لنسخ جميع عناوينه وصوره وملفاته إلى دروس الوحدة" },
        unit_id: { type: "string" },
        sync_unit_exercises: { type: "boolean", description: "عند true يتم نسخ ومزامنة كل تمارين الوحدة المستقلة بالترتيب إلى جميع دروس الوحدة" },
      },
    },
  },
  {
    name: "search_site_content",
    description: "البحث بالكلمات المفتاحية في جميع المواد والوحدات والدروس والتمارين والموارد.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
];

async function runToolCall(name: string, args: Record<string, any>, adminKey: string): Promise<unknown> {
  switch (name) {
    case "get_site_structure": {
      const d = await dbSelectAll();
      const filterSubj = args?.subject_id ? String(args.subject_id).trim() : "";
      const includeRes = Boolean(args?.include_resources);
      const subjects = filterSubj ? d.subjects.filter((s) => s.id === filterSubj) : d.subjects;

      const isRowEx = (l: LessonRow) => l.item_type === "exercise" || l.id.startsWith("ex-");
      return {
        totals: {
          subjects: d.subjects.length,
          units: d.units.length,
          lessons: d.lessons.filter((l) => !isRowEx(l)).length,
          unit_exercises: d.lessons.filter((l) => isRowEx(l)).length,
          resources: d.resources.length,
        },
        subjects: subjects.map((s) => {
          const sUnits = d.units.filter((u) => u.subject_id === s.id);
          return {
            id: s.id,
            name: s.name,
            icon: s.icon,
            color: s.color,
            sort_order: s.sort_order,
            units: sUnits.map((u) => {
              const uItems = d.lessons.filter((l) => l.unit_id === u.id);
              const mapItem = (l: LessonRow) => {
                const lRes = d.resources.filter((r) => r.lesson_id === l.id);
                const base: Record<string, unknown> = {
                  id: l.id,
                  title: l.title,
                  item_type: isRowEx(l) ? "exercise" : "lesson",
                  sort_order: l.sort_order,
                  counts: {
                    videos: lRes.filter((r) => r.kind === "video").length,
                    pdfs: lRes.filter((r) => r.kind === "pdf").length,
                    images: lRes.filter((r) => r.kind === "image").length,
                    exercises: lRes.filter((r) => r.kind === "exercise").length,
                  },
                };
                if (includeRes) base.resources = lRes;
                return base;
              };
              return {
                id: u.id,
                title: u.title,
                sort_order: u.sort_order,
                lessons: uItems.filter((l) => !isRowEx(l)).map(mapItem),
                unit_exercises: uItems.filter((l) => isRowEx(l)).map(mapItem),
              };
            }),
          };
        }),
      };
    }

    case "fetch_youtube_playlist": {
      const url = String(args?.url || "").trim();
      const maxVideos = Number(args?.max_videos) || 200;
      const [playlist, siteData] = await Promise.all([
        extractYouTubePlaylistOrVideo(url, maxVideos),
        dbSelectAll(),
      ]);
      return {
        playlist,
        existing_subjects: siteData.subjects.map((s) => ({
          id: s.id,
          name: s.name,
          units: siteData.units
            .filter((u) => u.subject_id === s.id)
            .map((u) => ({ id: u.id, title: u.title })),
        })),
      };
    }

    case "apply_curriculum_plan": {
      return await executeCurriculumPlan(args as CurriculumPlan, adminKey);
    }

    case "quick_import_youtube_playlist": {
      const url = String(args?.playlist_url || "").trim();
      const [playlist, siteData] = await Promise.all([
        extractYouTubePlaylistOrVideo(url, 250),
        dbSelectAll(),
      ]);
      const plan = buildSmartCurriculumPlan(playlist, siteData, {
        subjectNameOrId: args?.subject_name_or_id,
        unitTitleOrId: args?.unit_title_or_id,
        groupingMode: args?.grouping_mode || "smart",
        separateExercises: args?.separate_exercises !== false,
      });
      const result = await executeCurriculumPlan(plan, adminKey);
      return {
        ...result,
        playlist_title: playlist.title,
        videos_found_in_playlist: playlist.video_count,
      };
    }

    case "manage_subject": {
      const action = String(args?.action || "");
      if (action === "create") {
        const nameVal = String(args?.name || "").trim();
        if (!nameVal) throw new Error("اسم المادة مطلوب عند الإنشاء.");
        const d = await dbSelectAll();
        const maxOrder = d.subjects.reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
        const det = detectSubjectFromText(nameVal);
        const row: SubjectRow = {
          id: uid("s"),
          name: nameVal,
          icon: String(args?.icon || det?.icon || "book"),
          color: String(args?.color || det?.color || "indigo"),
          sort_order: Number(args?.sort_order) || maxOrder + 1,
        };
        const [saved] = await dbUpsert("subjects", [row], adminKey);
        return { ok: true, action: "created", subject: saved };
      }
      if (action === "update") {
        const id = String(args?.id || "").trim();
        if (!id) throw new Error("معرف المادة (id) مطلوب للتعديل.");
        const patch: Record<string, unknown> = {};
        if (args?.name !== undefined) patch.name = String(args.name).trim();
        if (args?.icon !== undefined) patch.icon = String(args.icon).trim();
        if (args?.color !== undefined) patch.color = String(args.color).trim();
        if (args?.sort_order !== undefined) patch.sort_order = Number(args.sort_order);
        const updated = await dbUpdate<SubjectRow>("subjects", id, patch, adminKey);
        return { ok: true, action: "updated", subject: updated };
      }
      if (action === "delete") {
        const id = String(args?.id || "").trim();
        if (!id) throw new Error("معرف المادة (id) مطلوب للحذف.");
        await dbDelete("subjects", id, adminKey);
        return { ok: true, action: "deleted", id };
      }
      throw new Error(`إجراء غير معروف في manage_subject: ${action}`);
    }

    case "manage_unit": {
      const action = String(args?.action || "");
      if (action === "create") {
        const subjectId = String(args?.subject_id || "").trim();
        const title = String(args?.title || "").trim();
        if (!subjectId || !title) throw new Error("كل من subject_id و title مطلوبان لإنشاء وحدة.");
        const d = await dbSelectAll();
        const maxOrder = d.units
          .filter((u) => u.subject_id === subjectId)
          .reduce((m, u) => Math.max(m, u.sort_order || 0), 0);
        const row: UnitRow = {
          id: uid("u"),
          subject_id: subjectId,
          title,
          sort_order: Number(args?.sort_order) || maxOrder + 1,
        };
        const [saved] = await dbUpsert("units", [row], adminKey);
        return { ok: true, action: "created", unit: saved };
      }
      if (action === "update") {
        const id = String(args?.id || "").trim();
        if (!id) throw new Error("معرف الوحدة (id) مطلوب للتعديل.");
        const patch: Record<string, unknown> = {};
        if (args?.subject_id !== undefined) patch.subject_id = String(args.subject_id).trim();
        if (args?.title !== undefined) patch.title = String(args.title).trim();
        if (args?.sort_order !== undefined) patch.sort_order = Number(args.sort_order);
        const updated = await dbUpdate<UnitRow>("units", id, patch, adminKey);
        return { ok: true, action: "updated", unit: updated };
      }
      if (action === "delete") {
        const id = String(args?.id || "").trim();
        if (!id) throw new Error("معرف الوحدة (id) مطلوب للحذف.");
        await dbDelete("units", id, adminKey);
        return { ok: true, action: "deleted", id };
      }
      throw new Error(`إجراء غير معروف في manage_unit: ${action}`);
    }

    case "manage_lesson": {
      const action = String(args?.action || "");
      if (action === "create") {
        const unitId = String(args?.unit_id || "").trim();
        const title = String(args?.title || "").trim();
        const itemType = args?.item_type === "exercise" ? "exercise" : "lesson";
        if (!unitId || !title) throw new Error("كل من unit_id و title مطلوبان لإنشاء درس أو تمرين.");
        const d = await dbSelectAll();
        const isRowEx = (l: LessonRow) => l.item_type === "exercise" || l.id.startsWith("ex-");
        const maxOrder = d.lessons
          .filter((l) => l.unit_id === unitId && (itemType === "exercise" ? isRowEx(l) : !isRowEx(l)))
          .reduce((m, l) => Math.max(m, l.sort_order || 0), 0);
        const row: LessonRow = {
          id: uid(itemType === "exercise" ? "ex" : "l"),
          unit_id: unitId,
          title,
          item_type: itemType,
          sort_order: Number(args?.sort_order) || maxOrder + 1,
        };
        const [saved] = await dbUpsert("lessons", [row], adminKey);
        return { ok: true, action: "created", lesson: saved };
      }
      if (action === "update") {
        const id = String(args?.id || "").trim();
        if (!id) throw new Error("معرف الدرس أو التمرين (id) مطلوب للتعديل.");
        const patch: Record<string, unknown> = {};
        if (args?.unit_id !== undefined) patch.unit_id = String(args.unit_id).trim();
        if (args?.title !== undefined) patch.title = String(args.title).trim();
        if (args?.item_type !== undefined) patch.item_type = args.item_type === "exercise" ? "exercise" : "lesson";
        if (args?.sort_order !== undefined) patch.sort_order = Number(args.sort_order);
        const updated = await dbUpdate<LessonRow>("lessons", id, patch, adminKey);
        return { ok: true, action: "updated", lesson: updated };
      }
      if (action === "delete") {
        const id = String(args?.id || "").trim();
        if (!id) throw new Error("معرف الدرس أو التمرين (id) مطلوب للحذف.");
        await dbDelete("lessons", id, adminKey);
        return { ok: true, action: "deleted", id };
      }
      throw new Error(`إجراء غير معروف في manage_lesson: ${action}`);
    }

    case "manage_resource": {
      const action = String(args?.action || "");
      if (action === "create") {
        const lessonId = String(args?.lesson_id || "").trim();
        const kind = String(args?.kind || "video").trim();
        const urlList: string[] = Array.isArray(args?.urls)
          ? args.urls.map((u: unknown) => String(u || "").trim()).filter(Boolean)
          : (args?.url ? [String(args.url).trim()].filter(Boolean) : []);
        if (!lessonId || !urlList.length) {
          throw new Error("كل من lesson_id و (url أو urls) مطلوبان لإضافة مورد.");
        }
        const d = await dbSelectAll();
        let nextOrder = d.resources
          .filter((r) => r.lesson_id === lessonId && r.kind === kind)
          .reduce((m, r) => Math.max(m, r.sort_order || 0), 0);

        const groupTitle = String(args?.group_title || args?.title || "محتوى").trim();
        const groupId = String(args?.group_id || uid("g")).trim();
        const exType = kind === "exercise" ? String(args?.exercise_type || "video") : null;

        const primaryRows: ResourceRow[] = urlList.map((u, idx) => {
          nextOrder += 1;
          return {
            id: uid("r"),
            lesson_id: lessonId,
            kind,
            title: urlList.length > 1 ? `${groupTitle} (${idx + 1})` : groupTitle,
            url: u,
            size: null,
            exercise_type: exType,
            group_id: groupId,
            group_title: groupTitle,
            sort_order: idx === 0 && args?.sort_order ? Number(args.sort_order) : nextOrder,
          };
        });

        const rowsToSave: ResourceRow[] = [...primaryRows];
        let copiedLessonsCount = 0;

        if (args?.copy_to_all_unit_lessons) {
          const parentItem = d.lessons.find((l) => l.id === lessonId);
          if (parentItem) {
            const isRowEx = (l: LessonRow) => l.item_type === "exercise" || l.id.startsWith("ex-");
            const parentIsEx = isRowEx(parentItem);
            const targetKind = parentIsEx ? "exercise" : kind;
            const targetExType = parentIsEx ? (kind === "exercise" ? (exType || "image") : kind) : exType;
            const siblingLessons = d.lessons.filter(
              (l) => l.unit_id === parentItem.unit_id && l.id !== lessonId && !isRowEx(l),
            );
            for (const sib of siblingLessons) {
              const sibRes = d.resources.filter((r) => r.lesson_id === sib.id && r.kind === targetKind);
              let sibMax = sibRes.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
              const sibGroupId = uid("g");
              let sibAdded = false;
              for (const pr of primaryRows) {
                if (sibRes.some((r) => r.url === pr.url)) continue;
                sibMax += 1;
                rowsToSave.push({
                  id: uid("r"),
                  lesson_id: sib.id,
                  kind: targetKind,
                  title: pr.title,
                  url: pr.url,
                  size: null,
                  exercise_type: targetExType,
                  group_id: sibGroupId,
                  group_title: groupTitle,
                  sort_order: sibMax,
                });
                sibAdded = true;
              }
              if (sibAdded) copiedLessonsCount++;
            }
          }
        }
        const saved = await dbUpsert("resources", rowsToSave, adminKey);
        return {
          ok: true,
          action: "created",
          group_id: groupId,
          group_title: groupTitle,
          items_created: primaryRows.length,
          resources: saved.slice(0, primaryRows.length),
          copied_to_lessons: copiedLessonsCount,
        };
      }
      if (action === "update") {
        const id = String(args?.id || "").trim();
        if (!id) throw new Error("معرف المورد (id) مطلوب للتعديل.");
        const patch: Record<string, unknown> = {};
        if (args?.lesson_id !== undefined) patch.lesson_id = String(args.lesson_id).trim();
        if (args?.kind !== undefined) patch.kind = String(args.kind).trim();
        if (args?.title !== undefined) patch.title = String(args.title).trim();
        if (args?.group_id !== undefined) patch.group_id = args.group_id ? String(args.group_id).trim() : null;
        if (args?.group_title !== undefined) patch.group_title = args.group_title ? String(args.group_title).trim() : null;
        if (args?.url !== undefined) patch.url = String(args.url).trim();
        if (args?.exercise_type !== undefined) patch.exercise_type = args.exercise_type;
        if (args?.sort_order !== undefined) patch.sort_order = Number(args.sort_order);
        const updated = await dbUpdate<ResourceRow>("resources", id, patch, adminKey);
        return { ok: true, action: "updated", resource: updated };
      }
      if (action === "delete") {
        const id = String(args?.id || "").trim();
        if (!id) throw new Error("معرف المورد (id) مطلوب للحذف.");
        await dbDelete("resources", id, adminKey);
        return { ok: true, action: "deleted", id };
      }
      throw new Error(`إجراء غير معروف في manage_resource: ${action}`);
    }

    case "copy_resource_to_unit_lessons": {
      const resourceId = String(args?.resource_id || "").trim();
      const groupIdArg = String(args?.group_id || "").trim();
      const exerciseIdArg = String(args?.exercise_id || "").trim();
      const syncUnitEx = Boolean(args?.sync_unit_exercises);
      const d = await dbSelectAll();
      const isRowEx = (l: LessonRow) => l.item_type === "exercise" || l.id.startsWith("ex-");

      let bundle: ResourceRow[] = [];
      let inferredUnitId = String(args?.unit_id || "").trim();

      if (syncUnitEx) {
        if (!inferredUnitId) throw new Error("معرف الوحدة (unit_id) مطلوب عند استخدام sync_unit_exercises.");
        const unitExs = d.lessons
          .filter((l) => l.unit_id === inferredUnitId && isRowEx(l))
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        for (const ex of unitExs) {
          for (const k of ["image", "pdf", "video"]) {
            const items = d.resources
              .filter((r) => r.lesson_id === ex.id && r.kind === k)
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            bundle.push(...items);
          }
        }
      } else if (exerciseIdArg) {
        const exRow = d.lessons.find((l) => l.id === exerciseIdArg);
        if (!exRow) throw new Error(`التمرين (${exerciseIdArg}) غير موجود.`);
        if (!inferredUnitId) inferredUnitId = exRow.unit_id;
        for (const k of ["image", "pdf", "video"]) {
          const items = d.resources
            .filter((r) => r.lesson_id === exRow.id && r.kind === k)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          bundle.push(...items);
        }
      } else if (groupIdArg) {
        bundle = d.resources
          .filter((r) => r.group_id === groupIdArg)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      } else if (resourceId) {
        bundle = d.resources.filter((r) => r.id === resourceId);
      } else {
        throw new Error("أحد المعاملات (resource_id أو group_id أو exercise_id أو sync_unit_exercises) مطلوب.");
      }

      if (!bundle.length) throw new Error("لم يتم العثور على موارد لنسخها.");

      const firstSrc = bundle[0];
      const firstParent = d.lessons.find((l) => l.id === firstSrc.lesson_id);
      const targetUnitId = inferredUnitId || firstParent?.unit_id || "";
      if (!targetUnitId) throw new Error("تعذّر تحديد الوحدة المستهدفة.");

      const targetLessons = d.lessons.filter(
        (l) => l.unit_id === targetUnitId && l.id !== firstSrc.lesson_id && !isRowEx(l),
      );
      const toInsert: ResourceRow[] = [];
      let copiedLessons = 0;
      let skipped = 0;
      for (const tl of targetLessons) {
        const groupMap = new Map<string, string>();
        let lessonTouched = false;
        for (const src of bundle) {
          const srcParent = d.lessons.find((l) => l.id === src.lesson_id);
          const fromEx = srcParent ? isRowEx(srcParent) : false;
          const mappedKind = fromEx ? "exercise" : src.kind;
          const mappedExType = fromEx
            ? (src.kind === "exercise" ? (src.exercise_type || "image") : src.kind)
            : src.exercise_type;

          const existing = [
            ...d.resources.filter((r) => r.lesson_id === tl.id && r.kind === mappedKind),
            ...toInsert.filter((r) => r.lesson_id === tl.id && r.kind === mappedKind),
          ];
          if (existing.some((r) => r.url === src.url)) {
            skipped++;
            continue;
          }
          const maxOrd = existing.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
          const srcGKey = src.group_id || `single-${src.id}`;
          if (!groupMap.has(srcGKey)) groupMap.set(srcGKey, uid("g"));

          toInsert.push({
            id: uid("r"),
            lesson_id: tl.id,
            kind: mappedKind,
            title: src.title,
            url: src.url,
            size: src.size,
            exercise_type: mappedExType,
            group_id: groupMap.get(srcGKey) || null,
            group_title: src.group_title ?? src.title ?? null,
            sort_order: maxOrd + 1,
          });
          lessonTouched = true;
        }
        if (lessonTouched) copiedLessons++;
      }
      if (toInsert.length) await dbUpsert("resources", toInsert, adminKey);
      return { ok: true, copied_lessons: copiedLessons, items_inserted: toInsert.length, skipped_existing: skipped };
    }

    case "search_site_content": {
      const q = normAr(String(args?.query || ""));
      if (!q) return { subjects: [], units: [], lessons: [], resources: [] };
      const d = await dbSelectAll();
      return {
        subjects: d.subjects.filter((s) => normAr(s.name).includes(q)),
        units: d.units.filter((u) => normAr(u.title).includes(q)),
        lessons: d.lessons.filter((l) => normAr(l.title).includes(q)),
        resources: d.resources
          .filter((r) => normAr(r.group_title || r.title || "").includes(q) || (r.url || "").toLowerCase().includes(q))
          .slice(0, 60),
      };
    }

    default:
      throw new Error(`أداة غير معروفة: ${name}`);
  }
}

const CLAUDE_MODELS = [
  "claude-sonnet-4-5",
  "claude-sonnet-4-20250514",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest",
];

async function callAnthropicMessages(anthropicKey: string, payload: Record<string, unknown>): Promise<any> {
  let lastErr = "";
  for (const model of CLAUDE_MODELS) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...payload, model }),
    });
    if (res.ok) return await res.json();
    const errTxt = await res.text();
    lastErr = errTxt;
    if (res.status !== 404 && !/not_found_error/i.test(errTxt)) {
      throw new Error(`خطأ من Claude API: ${errTxt}`);
    }
  }
  throw new Error(`خطأ من Claude API: ${lastErr}`);
}

async function organizeWithClaudeApi(
  anthropicKey: string,
  playlist: ExtractedPlaylist,
  siteData: SiteData,
  opts: {
    subjectNameOrId?: string;
    unitTitleOrId?: string;
    instructions?: string;
  },
): Promise<CurriculumPlan> {
  const existingSummary = siteData.subjects.map((s) => ({
    id: s.id,
    name: s.name,
    units: siteData.units
      .filter((u) => u.subject_id === s.id)
      .map((u) => ({ id: u.id, title: u.title })),
  }));

  const systemPrompt =
    `أنت خبير في مناهج شهادة البكالوريا الجزائرية ومنظم محتوى منصة "آية باك 2027".
مهمتك تحويل قائمة تشغيل يوتيوب إلى خطة JSON دقيقة بصيغة CurriculumPlan لتصنيف الفيديوهات حسب:
المادة (subject) ← الوحدات (units) ← الدروس أو تمارين الوحدة (lessons) ← الفيديوهات (videos) والتمارين (exercises).
القواعد:
1. إذا طابقت المادة أو الوحدة شيئاً موجوداً في الموقع، ضع الـ id الموجود.
2. نظف عناوين الدروس من الحشو الدعائي، واجمع أجزاء الدرس الواحد في درس واحد، وضع فيديوهات حلول التمارين إما في مصفوفة exercises داخل الدرس أو كعنصر مستقل مع item_type="exercise" إذا طلب المدير إضافتها لقسم تمارين الوحدة.
3. أرجع كائن JSON صالح فقط بدون أي نص خارجه أو علامات markdown.`;

  const userPayload = {
    existing_site_subjects_and_units: existingSummary,
    requested_subject: opts.subjectNameOrId || null,
    requested_unit: opts.unitTitleOrId || null,
    admin_instructions: opts.instructions || null,
    playlist_title: playlist.title,
    playlist_author: playlist.author,
    videos: playlist.videos.map((v) => ({
      index: v.index,
      title: v.title,
      url: v.url,
      is_exercise_hint: v.is_exercise_hint,
    })),
  };

  const body = await callAnthropicMessages(anthropicKey, {
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: JSON.stringify(userPayload) }],
  });

  const textBlock = (body.content || []).find((b: any) => b.type === "text")?.text || "";
  const jsonMatch = textBlock.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("لم يرجع Claude خطة JSON صالحة.");
  const parsed = JSON.parse(jsonMatch[0]) as CurriculumPlan;
  if (!parsed?.subject?.name || !Array.isArray(parsed?.units)) {
    throw new Error("صيغة الخطة المستلمة من Claude غير مكتملة.");
  }
  return parsed;
}

async function runClaudeAdminChat(
  anthropicKey: string,
  userMessages: Array<{ role: "user" | "assistant"; content: string }>,
  adminKey: string,
) {
  const claudeTools = MCP_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  const systemPrompt =
    `أنت المساعد الإداري الذكي لمنصة "آية باك 2027" (بكالوريا الجزائر).
يمكنك إدارة المواد والوحدات والدروس وتمارين الوحدات والموارد والمجموعات الديناميكية (عنوان + عدة صور/فيديوهات/ملفات PDF)، ونسخ أي مجموعة لجميع دروس الوحدة، واستخراج قوائم تشغيل يوتيوب وتقسيمها.
تحدث بالعربية الواضحة والمختصرة.`;

  const convo: any[] = userMessages.slice(-14).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));

  const executedTools: string[] = [];
  let mutated = false;

  for (let step = 0; step < 6; step++) {
    const msg = await callAnthropicMessages(anthropicKey, {
      max_tokens: 4096,
      system: systemPrompt,
      tools: claudeTools,
      messages: convo,
    });

    convo.push({ role: "assistant", content: msg.content });

    const toolUses = (msg.content || []).filter((c: any) => c.type === "tool_use");
    if (!toolUses.length) {
      const reply = (msg.content || [])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n")
        .trim();
      return { ok: true, reply, executed_tools: executedTools, mutated };
    }

    const toolResults: any[] = [];
    for (const tu of toolUses) {
      executedTools.push(tu.name);
      if (
        [
          "apply_curriculum_plan",
          "quick_import_youtube_playlist",
          "manage_subject",
          "manage_unit",
          "manage_lesson",
          "manage_resource",
          "copy_resource_to_unit_lessons",
        ].includes(tu.name)
      ) {
        mutated = true;
      }
      try {
        const out = await runToolCall(tu.name, tu.input || {}, adminKey);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(out),
        });
      } catch (err: any) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          is_error: true,
          content: String(err?.message || err),
        });
      }
    }
    convo.push({ role: "user", content: toolResults });
  }

  return {
    ok: true,
    reply: "تم تنفيذ الخطوات المطلوبة في الموقع بنجاح.",
    executed_tools: executedTools,
    mutated,
  };
}

const MCP_PROMPTS = [
  {
    name: "import_youtube_playlist",
    description: "إضافة قائمة تشغيل يوتيوب إلى موقع آية باك 2027 وتقسيمها حسب المادة والوحدة والدرس",
    arguments: [
      { name: "playlist_url", description: "رابط قائمة تشغيل يوتيوب", required: true },
      { name: "notes", description: "ملاحظات اختيارية حول المادة أو الوحدة", required: false },
    ],
  },
  {
    name: "review_site_curriculum",
    description: "عرض ومراجعة هيكل المواد والوحدات والدروس في موقع آية باك 2027",
    arguments: [],
  },
];

async function handleSingleJsonRpc(
  rpc: Record<string, any>,
  adminKey: string,
): Promise<Record<string, unknown> | null> {
  const hasId = Object.prototype.hasOwnProperty.call(rpc, "id") && rpc.id !== undefined;
  const id = rpc.id ?? null;
  const method = String(rpc.method || "");
  const params = rpc.params || {};

  if (!hasId) {
    return null;
  }

  try {
    if (method === "initialize") {
      const requestedVersion = String(params?.protocolVersion || "2025-03-26");
      const supported = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];
      const protocolVersion = supported.includes(requestedVersion) ? requestedVersion : "2025-03-26";

      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: {
            name: "aya-bac-2027",
            version: "1.2.1",
          },
          instructions:
            "خادم إدارة منصة «آية باك 2027» التعليمية. يدعم الدروس وتمارين الوحدات المستقلة والمجموعات الديناميكية للموارد (عنوان + عدة صور/فيديوهات/ملفات PDF عبر مصفوفة urls في manage_resource) ونسخ ومزامنة صفحة التمارين إلى دروس الوحدة.",
        },
      };
    }

    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
    }

    if (method === "tools/call") {
      const toolName = String(params?.name || "");
      const toolArgs = (params?.arguments && typeof params.arguments === "object") ? params.arguments : {};
      try {
        const result = await runToolCall(toolName, toolArgs, adminKey);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: false,
          },
        };
      } catch (toolErr: any) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: String(toolErr?.message || toolErr) }],
            isError: true,
          },
        };
      }
    }

    if (method === "prompts/list") {
      return { jsonrpc: "2.0", id, result: { prompts: MCP_PROMPTS } };
    }

    if (method === "prompts/get") {
      const pName = String(params?.name || "");
      const pArgs = params?.arguments || {};
      if (pName === "import_youtube_playlist") {
        const u = pArgs.playlist_url || "[ضع رابط القائمة]";
        const n = pArgs.notes ? `\nملاحظات إضافية: ${pArgs.notes}` : "";
        return {
          jsonrpc: "2.0",
          id,
          result: {
            description: "استيراد وتنظيم قائمة تشغيل يوتيوب في موقع آية باك 2027",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `قم بجلب قائمة تشغيل يوتيوب التالية: ${u}${n}\nافحص المواد والوحدات الحالية في موقع آية باك 2027، ثم قسّم الفيديوهات بدقة حسب المادة والوحدة والدرس أو التمارين، وأضفها إلى الموقع عبر apply_curriculum_plan ثم اعرض لي ملخصاً واضحاً.`,
                },
              },
            ],
          },
        };
      }
      return {
        jsonrpc: "2.0",
        id,
        result: {
          description: "مراجعة هيكل موقع آية باك 2027",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "اعرض لي هيكل المواد والوحدات والدروس والتمارين الحالية في موقع آية باك 2027 مع إحصائيات المحتوى.",
              },
            },
          ],
        },
      };
    }

    if (method === "resources/list") {
      return { jsonrpc: "2.0", id, result: { resources: [] } };
    }

    if (method === "resources/templates/list") {
      return { jsonrpc: "2.0", id, result: { resourceTemplates: [] } };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `الطريقة غير مدعومة: ${method}` },
    };
  } catch (err: any) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: String(err?.message || err) },
    };
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method === "DELETE") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  const { subPath, adminKey } = parseRequestAuthAndRoute(req);

  try {
    if (subPath === "/api/playlist") {
      let urlInput = new URL(req.url).searchParams.get("url") || "";
      if (req.method === "POST") {
        const b = await req.json().catch(() => ({}));
        urlInput = b.url || urlInput;
      }
      const [playlist, siteData] = await Promise.all([
        extractYouTubePlaylistOrVideo(urlInput, 250),
        dbSelectAll(),
      ]);
      const suggestedPlan = buildSmartCurriculumPlan(playlist, siteData, {
        groupingMode: "smart",
        separateExercises: true,
      });
      return jsonResponse({ ok: true, playlist, suggestedPlan });
    }

    if (subPath === "/api/ai-organize" && req.method === "POST") {
      const b = await req.json();
      const [playlist, siteData] = await Promise.all([
        b.playlist && Array.isArray(b.playlist.videos)
          ? Promise.resolve(b.playlist as ExtractedPlaylist)
          : extractYouTubePlaylistOrVideo(String(b.url || ""), 250),
        dbSelectAll(),
      ]);

      const claudeKey = String(b.anthropicKey || Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
      if (claudeKey) {
        const aiPlan = await organizeWithClaudeApi(claudeKey, playlist, siteData, {
          subjectNameOrId: b.subjectId,
          unitTitleOrId: b.unitId,
          instructions: b.instructions,
        });
        return jsonResponse({ ok: true, mode: "claude", playlist, plan: aiPlan });
      }

      const smartPlan = buildSmartCurriculumPlan(playlist, siteData, {
        subjectNameOrId: b.subjectId,
        unitTitleOrId: b.unitId,
        groupingMode: b.groupingMode || "smart",
        separateExercises: b.separateExercises !== false,
      });
      return jsonResponse({ ok: true, mode: "smart", playlist, plan: smartPlan });
    }

    if (subPath === "/api/ai-chat" && req.method === "POST") {
      const b = await req.json();
      const claudeKey = String(b.anthropicKey || Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
      if (!claudeKey) {
        return jsonResponse(
          { ok: false, error: "مفتاح Anthropic Claude API غير مدخل." },
          400,
        );
      }
      const chatRes = await runClaudeAdminChat(claudeKey, b.messages || [], adminKey);
      return jsonResponse(chatRes);
    }

    if (req.method === "GET") {
      const accept = (req.headers.get("accept") || "").toLowerCase();
      if (accept.includes("text/event-stream") && !accept.includes("text/html") && subPath === "/") {
        return new Response(null, {
          status: 405,
          headers: { ...CORS_HEADERS, Allow: "POST, DELETE, OPTIONS" },
        });
      }
      return jsonResponse({
        ok: true,
        service: "aya-bac-2027-mcp",
        version: "1.2.1",
        authenticated_key_present: Boolean(adminKey),
        tools_count: MCP_TOOLS.length,
        message: "خادم الذكاء الاصطناعي و Claude MCP لمنصة آية باك 2027 جاهز للاتصال.",
      });
    }

    if (req.method === "POST") {
      const payload = await req.json();

      if (Array.isArray(payload)) {
        const responses: Record<string, unknown>[] = [];
        for (const item of payload) {
          if (item && typeof item === "object") {
            const r = await handleSingleJsonRpc(item, adminKey);
            if (r) responses.push(r);
          }
        }
        if (responses.length === 0) {
          return new Response(null, { status: 202, headers: CORS_HEADERS });
        }
        return jsonResponse(responses);
      }

      if (payload && typeof payload === "object") {
        const r = await handleSingleJsonRpc(payload, adminKey);
        if (!r) {
          return new Response(null, { status: 202, headers: CORS_HEADERS });
        }
        return jsonResponse(r);
      }

      return jsonResponse(
        { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } },
        400,
      );
    }

    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  } catch (err: any) {
    return jsonResponse(
      { ok: false, error: String(err?.message || err || "خطأ غير متوقع في الخادم") },
      500,
    );
  }
});
