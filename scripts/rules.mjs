import crypto from "node:crypto";

export const guangdongTerms = ["广东", "广州", "深圳", "珠海", "东莞", "佛山", "惠州", "中山", "江门", "肇庆", "汕头", "湛江", "茂名", "韶关", "清远", "揭阳", "潮州", "梅州", "河源", "阳江", "云浮", "汕尾"];
export const internshipTerms = ["实习", "intern", "暑期实习", "日常实习", "实习生", "byteintern"];
export const graduateTerms = ["2027届", "2027 届", "2027校园招聘", "2027 校园招聘", "2027校招", "2027 校招", "2027应届", "2027 应届", "2027 graduates"];
export const socialTerms = ["社会招聘", "社招", "有经验人士", "experienced hire"];
export const nonGuangdongTerms = ["北京", "上海", "天津", "重庆", "浙江", "杭州", "宁波", "绍兴", "温州", "嘉兴", "江苏", "南京", "苏州", "无锡", "常州", "福建", "厦门", "福州", "山东", "青岛", "济南", "四川", "成都", "湖北", "武汉", "湖南", "长沙", "安徽", "合肥", "陕西", "西安", "河南", "郑州", "河北", "石家庄", "辽宁", "沈阳", "大连", "吉林", "黑龙江", "江西", "南昌", "广西", "海南", "云南", "贵州", "甘肃", "新疆", "内蒙古"];
const genericRoleTitles = /^(招聘岗位|岗位列表|职位列表|查看岗位|查看职位|热招职位|校园招聘|应届生|供应链族|职位详情|岗位详情)$/i;
const introductionTerms = ["致力于", "企业使命", "经营理念", "战略的重要组成部分", "近年来持续", "核心职能", "大脑中枢", "旗下的", "成为顾客", "提供约", "查看详情"];

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
export function cleanRoleTitle(value = "") {
  return normalizeText(value)
    .replace(/发布于\s*20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}.*$/i, "")
    .replace(/(?:查看详情|立即投递)\s*$/i, "")
    .trim();
}
export function isLikelyRoleTitle(value = "") {
  const title = cleanRoleTitle(value);
  if (title.length < 2 || title.length > 55 || genericRoleTitles.test(title)) return false;
  if (/共\s*\d+\s*个职位/.test(title) || containsAny(title, introductionTerms)) return false;
  if ((title.match(/[，。；！？]/g) || []).length >= 2) return false;
  return true;
}
export function hasWrongGraduateYear(text) {
  return [...text.matchAll(/202[0-9]\s*届/g)].some((match) => !/2027\s*届/.test(match[0]));
}
export function assessCandidate(text, source = {}, pageHas2027 = false, roleText = text) {
  const normalized = normalizeText(text);
  const normalizedRole = normalizeText(roleText);
  const track = classify(normalized);
  const explicitYear = containsAny(normalized, graduateTerms);
  const yearConfirmed = explicitYear || (source.recruitYear === "2027" && pageHas2027);
  const explicitLocation = containsAny(normalized, guangdongTerms);
  const explicitOutsideLocation = containsAny(normalized, nonGuangdongTerms);
  const roleHasGuangdong = containsAny(normalizedRole, guangdongTerms);
  const roleHasOutside = containsAny(normalizedRole, nonGuangdongTerms);
  const locationConfirmed = explicitLocation;
  const locationLead = !locationConfirmed && source.allowLocationLead === true && containsAny(source.defaultCity || "", guangdongTerms);
  const outsideOnly = explicitOutsideLocation && !explicitLocation;
  const titleOutsideOnly = roleHasOutside && !roleHasGuangdong;
  const excluded = containsAny(normalized, internshipTerms) || containsAny(normalized, socialTerms) || (hasWrongGraduateYear(normalized) && !explicitYear) || outsideOnly || titleOutsideOnly;
  const eligible = Boolean(track) && yearConfirmed && (locationConfirmed || locationLead) && !excluded;
  return { eligible, track, explicitYear, locationConfirmed, confidence: locationConfirmed ? "已核验具体岗位" : "广东地点待确认", confidenceRank: locationConfirmed ? 2 : 1 };
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
  const assessment = assessCandidate(text, source, pageHas2027, candidate.title);
  if (!assessment.eligible) return null;
  const role = cleanRoleTitle(candidate.title);
  if (!isLikelyRoleTitle(role)) return null;
  const directLink = candidate.directLink === true;
  const trustLabel = source.trustLevel === "government" ? "政府/国资公开来源" : source.trustLevel === "officialPartner" ? "企业授权招聘系统" : source.trustLevel === "notice" ? "公开招聘公告" : "企业官方招聘";
  return {
    id: stableId(source.company, role, candidate.url), company: source.company, employerType: source.employerType,
    role, city: inferCity(text, source.defaultCity, assessment.locationConfirmed), track: assessment.track.name, type: "2027届正式校招",
    priority: assessment.track.priority, match: Math.max(50, assessment.track.score - (assessment.confidenceRank === 1 ? 8 : 0)),
    confidence: assessment.confidence, confidenceRank: assessment.confidenceRank,
    locationEvidence: assessment.locationConfirmed ? `具体岗位上下文包含广东地点：${[...new Set(guangdongTerms.filter((term) => text.includes(term)))].join(" / ")}` : "企业招聘范围或来源指向广东，具体岗位城市尚待进入官网确认",
    why: assessment.locationConfirmed ? `${trustLabel}已在具体岗位上下文中确认2027届、广东地点和${assessment.track.name}方向证据；投递前仍请核验专业与截止日期。` : `${trustLabel}已确认2027届和${assessment.track.name}方向，招聘范围指向广东，但具体岗位城市仍需进入官网确认。`,
    skills: assessment.track.terms.filter((term) => text.toLowerCase().includes(term.toLowerCase())).slice(0, 3), url: candidate.url,
    directLink, source: directLink ? trustLabel : source.sourceType,
    status: assessment.locationConfirmed ? "具体岗位地点已核验为广东" : "广东候选岗位；具体工作城市待官网确认",
    sourceUrl: source.url, trustLevel: source.trustLevel || "official", discoveredAt: now, lastSeenAt: now, missCount: 0
  };
}
