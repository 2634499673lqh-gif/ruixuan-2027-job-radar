import crypto from "node:crypto";

export const guangdongTerms = ["广东", "广州", "深圳", "珠海", "东莞", "佛山", "惠州", "中山", "江门", "肇庆", "汕头", "湛江", "茂名", "韶关", "清远", "揭阳", "潮州", "梅州", "河源", "阳江", "云浮", "汕尾"];
export const internshipTerms = ["实习", "intern", "暑期实习", "日常实习", "实习生", "byteintern"];
export const graduateTerms = ["2027届", "2027 届", "2027校园招聘", "2027 校园招聘", "2027校招", "2027 校招", "2027应届", "2027 应届", "2027 graduates"];
export const socialTerms = ["社会招聘", "社招", "有经验人士", "experienced hire"];

const tracks = [
  { name: "产品运营", terms: ["产品运营", "用户运营", "互联网运营", "内容运营", "策略运营", "产品经理", "产品助理", "商业分析", "经营分析", "数据运营", "数据分析", "商品企划", "AI产品", "人工智能产品", "客户成功"], priority: "优先投递", score: 92 },
  { name: "智能汽车", terms: ["智能座舱", "汽车产品", "汽车运营", "用户体验", "商品企划", "车联网", "新能源运营", "汽车内容"], priority: "优先投递", score: 90 },
  { name: "出海电商", terms: ["跨境电商", "海外运营", "国际运营", "平台运营", "商家运营", "海外市场", "国际营销", "全球业务", "GTM"], priority: "优先投递", score: 88 },
  { name: "国际商务", terms: ["海外业务", "国际业务", "商务专员", "商务支持", "销售支持", "销售运营", "跟单", "外贸", "订单管理", "渠道商务", "项目运营", "业务支持"], priority: "相邻可投", score: 82 },
  { name: "供应链", terms: ["供应链", "采购", "物控", "计划物流", "物流运营", "订单履约", "生产计划", "计划交付", "商品运营"], priority: "相邻可投", score: 77 },
  { name: "银行管培", terms: ["管理培训生", "管培生", "公司金融", "国际结算", "综合营销", "客户经理", "银行运营", "金融业务", "证券业务"], priority: "补充选择", score: 68 }
];

export function normalizeText(value = "") { return String(value).replace(/\s+/g, " ").trim(); }
export function containsAny(text, terms) { const lower = text.toLowerCase(); return terms.some((term) => lower.includes(term.toLowerCase())); }
export function classify(text) { return tracks.find((track) => containsAny(text, track.terms)) || null; }
export function hasWrongGraduateYear(text) {
  return [...text.matchAll(/202[0-9]\s*届/g)].some((match) => !/2027\s*届/.test(match[0]));
}
export function assessCandidate(text, source = {}, pageHas2027 = false) {
  const normalized = normalizeText(text);
  const track = classify(normalized);
  const explicitYear = containsAny(normalized, graduateTerms);
  const yearConfirmed = explicitYear || (source.recruitYear === "2027" && pageHas2027);
  const explicitLocation = containsAny(normalized, guangdongTerms);
  const sourceLocation = source.locationMode === "guangdongOnly";
  const locationConfirmed = explicitLocation || sourceLocation;
  const excluded = containsAny(normalized, internshipTerms) || containsAny(normalized, socialTerms) || (hasWrongGraduateYear(normalized) && !explicitYear);
  const eligible = Boolean(track) && yearConfirmed && !excluded && (locationConfirmed || source.allowLocationLead === true);
  return { eligible, track, explicitYear, locationConfirmed, confidence: yearConfirmed && locationConfirmed ? "已核验具体岗位" : "待官网核验", confidenceRank: yearConfirmed && locationConfirmed ? 2 : 1 };
}
export function isEligible(text, defaultCity = "") {
  return assessCandidate(text, { locationMode: defaultCity && containsAny(defaultCity, guangdongTerms) ? "guangdongOnly" : "explicit" }, false).eligible;
}
export function stableId(company, role, url) { return crypto.createHash("sha1").update(`${company}|${role}|${url}`).digest("hex").slice(0, 12); }
export function inferCity(text, fallback, locationConfirmed = true) {
  const hits = guangdongTerms.filter((term) => text.includes(term));
  if (hits.length) return [...new Set(hits)].slice(0, 3).join(" / ");
  return locationConfirmed ? fallback : "广东省（具体城市待核验）";
}
export function makeJob(source, candidate, now, pageHas2027 = false) {
  const text = normalizeText(`${candidate.title} ${candidate.context}`);
  const assessment = assessCandidate(text, source, pageHas2027);
  if (!assessment.eligible) return null;
  const role = normalizeText(candidate.title).slice(0, 100);
  const directLink = candidate.directLink === true;
  const trustLabel = source.trustLevel === "government" ? "政府/国资公开来源" : source.trustLevel === "officialPartner" ? "企业授权招聘系统" : source.trustLevel === "notice" ? "公开招聘公告" : "企业官方招聘";
  return {
    id: stableId(source.company, role, candidate.url), company: source.company, employerType: source.employerType,
    role, city: inferCity(text, source.defaultCity, assessment.locationConfirmed), track: assessment.track.name, type: "2027届正式校招",
    priority: assessment.track.priority, match: Math.max(50, assessment.track.score - (assessment.confidenceRank === 1 ? 8 : 0)),
    confidence: assessment.confidence, confidenceRank: assessment.confidenceRank,
    why: assessment.confidenceRank === 2 ? `${trustLabel}已同时出现2027届、广东地点和${assessment.track.name}方向证据；投递前仍请核验专业与截止日期。` : `${trustLabel}已确认2027届及${assessment.track.name}方向，但广东具体岗位地点仍需进入官网复核。`,
    skills: assessment.track.terms.filter((term) => text.toLowerCase().includes(term.toLowerCase())).slice(0, 3), url: candidate.url,
    directLink, source: directLink ? trustLabel : source.sourceType,
    status: assessment.confidenceRank === 2 ? "官网信息已交叉校验" : "招聘线索，地点待官网核验",
    sourceUrl: source.url, trustLevel: source.trustLevel || "official", discoveredAt: now, lastSeenAt: now, missCount: 0
  };
}
