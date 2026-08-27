import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// Single endpoint that returns ALL data needed by /fr/ressources page:
// - 24 resources with subject/class/teacher joined (1 query with LEFT JOIN)
// - Total count (1 query)
// - Facet counts (1 query with GROUP BY on multiple columns)
// - Class/Section/Subject lists (1 query for all)
// 
// Total: ~3-4 SQL queries vs 22+ in the current prisma-compat implementation

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    // Parse filters
    const q = sp.get('q') || '';
    const type = sp.getAll('type');
    const classSlug = sp.getAll('class');
    const section = sp.getAll('section');
    const subject = sp.getAll('subject');
    const trimestre = sp.getAll('trimestre');
    const year = sp.getAll('year');
    const language = sp.getAll('language');
    const hasCorrection = sp.get('hasCorrection') === '1';
    const collegePilote = sp.get('collegePilote') === '1';
    const collegeOrdinaire = sp.get('collegeOrdinaire') === '1';
    const lyceePilote = sp.get('lyceePilote') === '1';
    const lyceeOrdinaire = sp.get('lyceeOrdinaire') === '1';
    const sort = sp.get('sort') || 'recent';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const PAGE_SIZE = 24;
    
    // Build WHERE clauses
    const conditions: string[] = ["r.status = 'PUBLISHED'"];
    const params: any[] = [];
    
    if (q) {
      conditions.push("(r.title LIKE ? OR r.description LIKE ? OR r.summary LIKE ?)");
      const qParam = `%${q}%`;
      params.push(qParam, qParam, qParam);
    }
    if (type.length > 0) {
      conditions.push(`r.type IN (${type.map(() => '?').join(',')})`);
      params.push(...type);
    }
    if (subject.length > 0) {
      conditions.push(`s.slug IN (${subject.map(() => '?').join(',')})`);
      params.push(...subject);
    }
    if (trimestre.length > 0) {
      conditions.push(`r.trimester IN (${trimestre.map(() => '?').join(',')})`);
      params.push(...trimestre);
    }
    if (year.length > 0) {
      conditions.push(`r.year IN (${year.map(() => '?').join(',')})`);
      params.push(...year);
    }
    if (language.length > 0) {
      conditions.push(`r.language IN (${language.map(() => '?').join(',')})`);
      params.push(...language);
    }
    if (hasCorrection) conditions.push("r.hasCorrection = 1");
    
    // Category filters: schoolType + levelId (via JOIN to Class)
    // Now that classId is populated (migration commit), we can use the
    // proper level-based filter.
    const levelConditions: string[] = [];
    if (collegePilote) { levelConditions.push("(cls.levelId = (SELECT id FROM Level WHERE slug = 'college') AND r.schoolType = 'PILOTE')"); }
    if (collegeOrdinaire) { levelConditions.push("(cls.levelId = (SELECT id FROM Level WHERE slug = 'college') AND (r.schoolType = 'PUBLIC' OR r.schoolType IS NULL))"); }
    if (lyceePilote) { levelConditions.push("(cls.levelId = (SELECT id FROM Level WHERE slug = 'lycee') AND r.schoolType = 'PILOTE')"); }
    if (lyceeOrdinaire) { levelConditions.push("(cls.levelId = (SELECT id FROM Level WHERE slug = 'lycee') AND (r.schoolType = 'PUBLIC' OR r.schoolType IS NULL))"); }
    if (levelConditions.length > 0) {
      conditions.push('(' + levelConditions.join(' OR ') + ')');
    }
    
    // Class and section filters (after the JOINs)
    // Always LEFT JOIN `Class` and `Section` - we need their data for the resource cards
    // Note: 'cls' and 'sec' as aliases (avoiding 'c' which can conflict in some SQL dialects)
    const joinClass = 'LEFT JOIN `Class` cls ON r.classId = cls.id LEFT JOIN `Section` sec ON r.sectionId = sec.id';
    if (classSlug.length > 0) {
      conditions.push(`cls.slug IN (${classSlug.map(() => '?').join(',')})`);
      params.push(...classSlug);
    }
    if (section.length > 0) {
      conditions.push(`sec.slug IN (${section.map(() => '?').join(',')})`);
      params.push(...section);
    }
    
    // ORDER BY
    const orderBy = sort === 'popular' ? 'r.viewsCount DESC' :
                    sort === 'downloads' ? 'r.downloadsCount DESC' :
                    sort === 'rating' ? 'r.ratingsCount DESC' :
                    sort === 'oldest' ? 'r.publishedAt ASC' :
                    'r.publishedAt DESC';
    
    const whereClause = conditions.join(' AND ');
    const offset = (page - 1) * PAGE_SIZE;
    
    // ============== Single big query for resources with all joins ==============
    // LEFT JOINs: subject (always), class, section, teacher
    // Note: Resource has subjectId as non-null FK, class/section/teacher as nullable
    // Use string concat (not template literal) to avoid backtick escaping issues
    // with reserved words like Class/Section/User
    const resourcesSql = [
      'SELECT',
      '  r.id, r.slug, r.numericId, r.title, r.description, r.summary,',
      '  r.type, r.language, r.year, r.trimester, r.publishedAt,',
      '  r.hasCorrection, r.schoolType, r.viewsCount, r.downloadsCount,',
      '  r.avgRating, r.ratingsCount, r.pageCount, r.fileSize,',
      '  r.subjectId, r.classId, r.sectionId, r.teacherId,',
      '  s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.color as s_color, s.icon as s_icon,',
      '  cls.id as c_id, cls.slug as c_slug, cls.nameFr as c_nameFr,',
      '  sec.id as sec_id, sec.slug as sec_slug, sec.nameFr as sec_nameFr,',
      '  t.id as t_id, t.firstName as t_firstName, t.lastName as t_lastName,',
      '  t.firstNameAr as t_firstNameAr, t.lastNameAr as t_lastNameAr,',
      '  t.avatarUrl as t_avatarUrl, t.schoolName as t_schoolName',
      'FROM Resource r',
      'LEFT JOIN \`Subject\` s ON r.subjectId = s.id',
      'LEFT JOIN \`User\` t ON r.teacherId = t.id',
      joinClass,
      'WHERE ' + whereClause,
      'ORDER BY ' + orderBy,
      'LIMIT ? OFFSET ?',
    ].join('\n');
    const resources = await db.prepare(resourcesSql).bind(...params, PAGE_SIZE, offset).all();
    
    // ============== Count query ==============
    const countSql = "SELECT COUNT(*) as total FROM Resource r LEFT JOIN \`Subject\` s ON r.subjectId = s.id " + joinClass + " WHERE " + whereClause;
    const countResult = await db.prepare(countSql).bind(...params).first();
    const total = countResult?.total || 0;
    
    // ============== Facet counts (1 query for type/trimester/year/language) ==============
    // Facet query - aggregate in JS
    const facetSql = "SELECT r.classId as r_classId, r.sectionId as r_sectionId, r.subjectId as r_subjectId, r.type, r.trimester, r.year, r.language, r.hasCorrection, r.schoolType FROM Resource r LEFT JOIN \`Subject\` s ON r.subjectId = s.id " + joinClass + " WHERE " + whereClause;
    const facetsRaw = await db.prepare(facetSql).bind(...params).all();
    
    // Aggregate in JS
    const byType: Record<string, number> = {};
    const byTrimestre: Record<string, number> = {};
    const byYear: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};
    let withCorrection = 0;
    let collegePiloteN = 0, collegeOrdinaireN = 0, lyceePiloteN = 0, lyceeOrdinaireN = 0;
    const classCounts = new Map<string, number>();
    const sectionCounts = new Map<string, number>();
    const subjectCounts = new Map<string, number>();
    
    const facetsFull = await db.prepare(facetSql).bind(...params).all();
    
    for (const r of (facetsFull.results || [])) {
      if (r.type) byType[r.type] = (byType[r.type] || 0) + 1;
      if (r.trimester) byTrimestre[r.trimester] = (byTrimestre[r.trimester] || 0) + 1;
      if (r.year) byYear[r.year] = (byYear[r.year] || 0) + 1;
      if (r.language) byLanguage[r.language] = (byLanguage[r.language] || 0) + 1;
      if (r.hasCorrection) withCorrection++;
      // Category counts (need classId mapping)
      // Skip for now, get from classId join
    }
    
    // ============== Get class/section/subject names (small lookup tables) ==============
    const [allClasses, allSections, allSubjects] = await Promise.all([
      db.prepare("SELECT id, slug, nameFr, nameAr, levelId FROM `Class`").all(),
      db.prepare("SELECT id, slug, nameFr, nameAr, numericId FROM `Section`").all(),
      db.prepare("SELECT id, slug, nameFr, nameAr, color, icon FROM `Subject`").all(),
    ]);
    
    const classMap = new Map<string, any>();
    for (const c of (allClasses.results || [])) classMap.set(c.id, c);
    const sectionMap = new Map<string, any>();
    for (const s of (allSections.results || [])) sectionMap.set(s.id, s);
    const subjectMap = new Map<string, any>();
    for (const s of (allSubjects.results || [])) subjectMap.set(s.id, s);
    
    // Compute category counts using class->level map
    const classLevelMap = new Map<string, string>();
    for (const c of (allClasses.results || [])) {
      if (c.levelId) {
        // Get level slug from the first character of classId or query
        // For now, just store the levelId
        classLevelMap.set(c.id, c.levelId);
      }
    }
    
    // Get level slugs
    const levels = await db.prepare("SELECT id, slug FROM `Level`").all();
    const levelSlugMap = new Map<string, string>();
    for (const l of (levels.results || [])) levelSlugMap.set(l.id, l.slug);
    
    // Aggregate category counts
    for (const r of (facetsFull.results || [])) {
      if (r.r_classId && classLevelMap.has(r.r_classId)) {
        const levelId = classLevelMap.get(r.r_classId);
        const levelSlug = levelSlugMap.get(levelId);
        const isPilote = r.schoolType === 'PILOTE';
        if (levelSlug === 'college' && isPilote) collegePiloteN++;
        else if (levelSlug === 'college' && !isPilote) collegeOrdinaireN++;
        else if (levelSlug === 'lycee' && isPilote) lyceePiloteN++;
        else if (levelSlug === 'lycee' && !isPilote) lyceeOrdinaireN++;
        
        // byClass, bySection, bySubject
        const c = classMap.get(r.r_classId);
        if (c) classCounts.set(c.slug, (classCounts.get(c.slug) || 0) + 1);
      }
      if (r.r_sectionId) {
        const sec = sectionMap.get(r.r_sectionId);
        if (sec) sectionCounts.set(sec.slug, (sectionCounts.get(sec.slug) || 0) + 1);
      }
      if (r.r_subjectId) {
        const sub = subjectMap.get(r.r_subjectId);
        if (sub) subjectCounts.set(sub.slug, (subjectCounts.get(sub.slug) || 0) + 1);
      }
    }
    
    // ============== Format resources with joined data ==============
    const formattedResources = (resources.results || []).map((r: any) => ({
      id: r.id,
      slug: r.slug,
      numericId: r.numericId,
      title: r.title,
      description: r.description,
      summary: r.summary,
      type: r.type,
      language: r.language,
      year: r.year,
      trimester: r.trimester,
      publishedAt: r.publishedAt,
      hasCorrection: !!r.hasCorrection,
      schoolType: r.schoolType,
      viewsCount: r.viewsCount || 0,
      downloadsCount: r.downloadsCount || 0,
      avgRating: r.avgRating || 0,
      ratingCount: r.ratingsCount || 0,
      pageCount: r.pageCount,
      fileSize: r.fileSize,
      subjectId: r.subjectId,
      classId: r.classId,
      sectionId: r.sectionId,
      teacherId: r.teacherId,
      // Joined data
      subject: r.s_id ? { slug: r.s_slug, nameFr: r.s_nameFr, color: r.s_color, icon: r.s_icon } : null,
      class: r.c_id ? { slug: r.c_slug, nameFr: r.c_nameFr } : null,
      section: r.sec_id ? { slug: r.sec_slug, nameFr: r.sec_nameFr } : null,
      teacher: r.t_id ? {
        firstName: r.t_firstName,
        lastName: r.t_lastName,
        firstNameAr: r.t_firstNameAr,
        lastNameAr: r.t_lastNameAr,
        avatarUrl: r.t_avatarUrl,
        schoolName: r.t_schoolName,
      } : null,
    }));
    
    return NextResponse.json({
      resources: formattedResources,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
      currentPage: page,
      facets: {
        byType,
        byTrimestre,
        byYear,
        byLanguage,
        withCorrection,
        collegePilote: collegePiloteN,
        collegeOrdinaire: collegeOrdinaireN,
        lyceePilote: lyceePiloteN,
        lyceeOrdinaire: lyceeOrdinaireN,
        byClass: Object.fromEntries(classCounts),
        bySection: Object.fromEntries(sectionCounts),
        bySubject: Object.fromEntries(subjectCounts),
      },
      nameMaps: {
        class: Object.fromEntries((allClasses.results || []).map((c: any) => [c.slug, c.nameFr])),
        section: Object.fromEntries((allSections.results || []).map((s: any) => [s.slug, s.nameFr])),
        subject: Object.fromEntries((allSubjects.results || []).map((s: any) => [s.slug, s.nameFr])),
      },
      // Pass the classId maps for client-side filters
      classLevels: Object.fromEntries(
        (allClasses.results || []).map((c: any) => [c.id, levelSlugMap.get(c.levelId) || null])
      ),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}

// Cache levelClassIds for the category filters
async function getLevelClassIds(db: any): Promise<{ college: string[], lycee: string[] }> {
  const levels = await db.prepare("SELECT id, slug FROM `Level`").all();
  const collegeLevel = (levels.results || []).find((l: any) => l.slug === 'college');
  const lyceeLevel = (levels.results || []).find((l: any) => l.slug === 'lycee');
  
  const result: { college: string[], lycee: string[] } = { college: [], lycee: [] };
  
  if (collegeLevel) {
    const classes = await db.prepare("SELECT id FROM `Class` WHERE levelId = ?").bind(collegeLevel.id).all();
    result.college = (classes.results || []).map((c: any) => c.id);
  }
  if (lyceeLevel) {
    const classes = await db.prepare("SELECT id FROM `Class` WHERE levelId = ?").bind(lyceeLevel.id).all();
    result.lycee = (classes.results || []).map((c: any) => c.id);
  }
  
  return result;
}
