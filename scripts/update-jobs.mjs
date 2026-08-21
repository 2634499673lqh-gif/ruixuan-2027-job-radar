import fs from "node:fs/promises";
import { chromium } from "playwright";
import { cleanRoleTitle, isLikelyRoleTitle, makeJob, normalizeText, stableId } from "./rules.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await fs.readFile(new URL(path, root), "utf8"));
const writeJson = async (path, value) => fs.writeFile(new URL(path, root), `${JSON.stringify(value, null, 2)}\n`);
const now = new Date().toISOString();
const day = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replaceAll("/", "-");
const genericTitles = /^(查看|了解|更多|详情|立即投递|投递|职位|岗位|校园招聘|加入我们|招聘入口|应届生)$/i;

const sources = await readJson("config/sources.json");
const jobs = await readJson("data/jobs.json");
const history = await readJson("data/history.json");
const successfulSources = new Set();
const discovered = [];
const failures = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "zh-CN", userAgent: "Mozilla/5.0 (compatible; RuiXuanJobRadar/2.0; +https://github.com/2634499673lqh-gif/ruixuan-2027-job-radar)" });

async function scanSource(source) {
  const page = await context.newPage();
  try {
    const response = await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status() || "no response"}`);
    await page.waitForTimeout(source.renderWaitMs || 4500);
    await page.evaluate(() => window.scrollTo(0, Math.min(document.body?.scrollHeight || 0, 5000))).catch(() => {});
    await page.waitForTimeout(800);
    const snapshot = await page.evaluate(() => {
      const items = [...document.querySelectorAll("a[href]")].map((a) => {
        const titleNode = a.querySelector('h1,h2,h3,h4,[class*="job-title"],[class*="position-name"],[class*="jobName"],[class*="positionName"]');
        return {
        title: (a.getAttribute("aria-label") || a.getAttribute("title") || titleNode?.textContent || a.textContent || "").trim(),
        context: (a.closest("li, article, section, tr, [class*=job], [class*=position], div")?.textContent || "").trim().slice(0, 1200),
        url: a.href
      }; });
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const values = [JSON.parse(script.textContent || "null")].flat().flatMap((value) => value?.["@graph"] || value || []);
          for (const value of values) if (value?.["@type"] === "JobPosting") items.push({ title: value.title || "", context: `${value.description || ""} ${value.jobLocation?.address?.addressLocality || ""}`, url: value.url || location.href });
        } catch {}
      }
      return { pageText: document.body?.innerText || "", items };
    });
    successfulSources.add(source.id || source.company);
    const pageHas2027 = /2027\s*届|2027\s*(校园招聘|校招|应届)|2027 graduates/i.test(snapshot.pageText) || source.recruitYear === "2027";
    const unique = new Map();
    for (const item of snapshot.items) {
      const title = cleanRoleTitle(item.title);
      if (!isLikelyRoleTitle(title) || !/^https?:/.test(item.url)) continue;
      const directLink = item.url.replace(/[#/?]+$/, "") !== source.url.replace(/[#/?]+$/, "") && !genericTitles.test(title);
      const candidate = { ...item, title, context: normalizeText(item.context), directLink };
      const job = makeJob(source, candidate, now, pageHas2027);
      if (job) unique.set(job.id, job);
    }
    discovered.push(...unique.values());
  } catch (error) {
    failures.push({ company: source.company, url: source.url, error: String(error.message || error).slice(0, 180) });
  } finally { await page.close(); }
}

const queue = [...sources];
await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
  while (queue.length) await scanSource(queue.shift());
}));
await browser.close();

const deduped = new Map();
for (const job of discovered) deduped.set(stableId(job.company, job.role, job.url), job);
const rejectedExisting = [];
const existingById = new Map();
for (const job of jobs) {
  const role = cleanRoleTitle(job.role);
  if (!isLikelyRoleTitle(role)) { rejectedExisting.push(job); continue; }
  const normalized = { ...job, role, id: stableId(job.company, role, job.url) };
  existingById.set(normalized.id, normalized);
}
const added = [];
for (const [id, job] of deduped) {
  const previous = existingById.get(id);
  if (previous) existingById.set(id, { ...previous, ...job, discoveredAt: previous.discoveredAt || now, lastSeenAt: now, missCount: 0 });
  else { existingById.set(id, job); added.push(job); }
}

const archived = [];
for (const [id, job] of existingById) {
  const sourceKey = sources.find((source) => source.company === job.company)?.id || job.company;
  if (deduped.has(id) || !successfulSources.has(sourceKey) || !job.directLink) continue;
  const missCount = (job.missCount || 0) + 1;
  if (missCount >= 3) {
    archived.push({ company: job.company, role: job.role, city: job.city, archivedAt: day.slice(0, 10), reason: "连续3次成功核查未再发现该独立岗位，已移入待复核归档", url: job.url });
    existingById.delete(id);
  } else existingById.set(id, { ...job, missCount });
}

const nextJobs = [...existingById.values()].sort((a, b) => (b.confidenceRank || 2) - (a.confidenceRank || 2) || b.match - a.match || a.company.localeCompare(b.company, "zh-CN"));
history.archivedJobs = [...archived, ...history.archivedJobs];
history.changeLog = [{
  date: day, type: archived.length ? "归档" : added.length ? "新增" : "更新",
  title: added.length || archived.length || rejectedExisting.length ? `自动核查：新增${added.length}条，归档${archived.length}条，清理误识别${rejectedExisting.length}条` : "自动核查完成：暂无确定变更",
  detail: `成功读取${successfulSources.size}/${sources.length}个可信公开来源；失败${failures.length}个。企业介绍和非岗位长文本不会作为岗位名称入库。`
}, ...history.changeLog].slice(0, 180);

await writeJson("data/jobs.json", nextJobs);
await writeJson("data/history.json", history);
await writeJson("data/meta.json", {
  lastSuccessfulCheck: now, lastRunStatus: failures.length === sources.length ? "failed" : failures.length ? "partial" : "success",
  sourceCount: sources.length, successfulSourceCount: successfulSources.size, failedSources: failures,
  verifiedCount: nextJobs.filter((job) => (job.confidenceRank || 2) === 2).length,
  leadCount: nextJobs.filter((job) => job.confidenceRank === 1).length,
  activeCount: nextJobs.length, archivedCount: history.archivedJobs.length, addedCount: added.length, archivedThisRun: archived.length, rejectedTitleCount: rejectedExisting.length
});
if (failures.length === sources.length) throw new Error("所有来源均读取失败；已保留现有岗位数据，但本次运行不应部署");
console.log(`完成：${successfulSources.size}/${sources.length}个来源，新增${added.length}，归档${archived.length}，当前${nextJobs.length}。`);
