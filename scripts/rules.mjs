import crypto from "node:crypto";

export const guangdongTerms = ["广东", "广州", "深圳", "珠海", "东莞", "佛山", "惠州", "中山", "江门", "肇庆", "汕头", "湛江", "茂名", "韶关", "清远", "揭阳", "潮州", "梅州", "河源", "阳江", "云浮", "汕尾"];
export const internshipTerms = ["实习", "intern", "暑期实习", "日常实习", "实习生"];
export const graduateTerms = ["2027届", "2027 届", "2027校园招聘", "2027 校园招聘", "2027校招", "2027 校招", "2027应届", "2027 应届"];

const tracks = [
  { name: "产品运营", terms: ["产品运营", "用户运营", "互联网运营", "产品经理", "商业分析", "经营分析", "数据运营", "数据分析", "商品企划", "AI产品", "人工智能产品"], priority: "优先投递", score: 92 },
  { name: "智能汽车", terms: ["智能座舱", "汽车产品", "汽车运营", "用户体验", "商品企划", "车联网"], priority: "优先投递", score: 90 },
  { name: "出海电商", terms: ["跨境电商", "海外运营", "国际运营", "平台运营", "商家运营", "海外市场"], priority: "优先投递", score: 88 },
  { name: "国际商务", terms: ["海外业务", "国际业务", "商务专员", "商务支持", "销售支持", "销售运营", "跟单", "外贸", "订单管理", "渠道商务"], priority: "相邻可投", score: 82 },
  { name: "供应链", terms: ["供应链", "采购", "物控", "计划物流", "物流运营", "订单履约", "生产计划"], priority: "相邻可投", score: 77 },
  { name: "银行管培", terms: ["管理培训生", "管培生", "公司金融", "国际结算", "综合营销", "客户经理", "银行运营"], priority: "补充选择", score: 68 }
];

export function normalizeText(value = "") { return value.replace(/\s+/g, " ").trim(); }
export function containsAny(text, terms) { const lower = text.toLowerCase(); return terms.some((term) => lower.includes(term.toLowerCase())); }
export function classify(text) { return tracks.find((track) => containsAny(text, track.terms)) || null; }
export function isEligible(text, defaultCity = "") {
  const combined = normalizeText(`${text} ${defaultCity}`);
  return containsAny(combined, graduateTerms) && containsAny(combined, guangdongTerms) && !containsAny(combined, internshipTerms) && Boolean(classify(combined));
}
export function stableId(company, role, url) { return crypto.createHash("sha1").update(`${company}|${role}|${url}`).digest("hex").slice(0, 12); }
export function inferCity(text, fallback) { const hits = guangdongTerms.filter((term) => text.includes(term)); return hits.length ? [...new Set(hits)].slice(0, 3).join(" / ") : fallback; }
export function makeJob(source, candidate, now) {
  const text = normalizeText(`${candidate.title} ${candidate.context}`);
  const track = classify(text);
  const role = normalizeText(candidate.title).slice(0, 100);
  return {
    id: stableId(source.company, role, candidate.url), company: source.company, employerType: source.employerType,
    role, city: inferCity(text, source.defaultCity), track: track.name, type: "2027届正式校招",
    priority: track.priority, match: track.score, why: `自动发现于${source.sourceType}；岗位文本与${track.name}方向匹配，投递前请核验专业、毕业时间与具体工作地点。`,
    skills: track.terms.filter((term) => text.toLowerCase().includes(term.toLowerCase())).slice(0, 3), url: candidate.url,
    directLink: candidate.url !== source.url, source: candidate.url !== source.url ? "具体岗位" : source.sourceType,
    status: "自动核验中，以官网状态为准", discoveredAt: now, lastSeenAt: now, missCount: 0
  };
}
