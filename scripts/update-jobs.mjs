import fs from "node:fs/promises";
import { chromium } from "playwright";
import { isEligible, makeJob, normalizeText, stableId } from "./rules.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await fs.readFile(new URL(path, root), "utf8"));
const writeJson = async (path, value) => fs.writeFile(new URL(path, root), `${JSON.stringify(value, null, 2)}\n`);
const now = new Date().toISOString();
const day = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replaceAll("/", "-");

const sources = await readJson("config/sources.json");
const jobs = await readJson("data/jobs.json");
const history = await readJson("data/history.json");
const successfulSources = new Set();
const discovered = [];
const failures = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "zh-CN", userAgent: "Mozilla/5.0 (compatible; RuiXuanJobRadar/1.0; +https://github.com/2634499673lqh-gif/ruixuan-2027-job-radar)" });

for (const source of sources) {
  const page = await context.newPage();
  try {
    const response = await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status() || "no response"}`);
    await page.waitForTimeout(3500);
    const snapshot = await page.evaluate(() => ({
      pageText: document.body?.innerText || "",
      links: [...document.querySelectorAll("a[href]")].map((a) => ({
        title: (a.textContent || a.getAttribute("aria-label") || "").trim(),
        context: (a.closest("li, article, section, tr, div")?.textContent || "").trim().slice(0, 800),
        url: a.href
      })).filter((item) => item.title.length >= 2 && item.title.length <= 140 && /^https?:/.test(item.url))
    }));
    successfulSources.add(source.company);
    const pageHas2027 = /2027\s*届|2027\s*(校园招聘|校招|应届)/i.test(snapshot.pageText);
    for (const link of snapshot.links) {
      const candidate = { ...link, context: normalizeText(`${link.context} ${pageHas2027 ? "2027届" : ""}`) };
      if (isEligible(`${candidate.title} ${candidate.context}`, source.defaultCity)) discovered.push(makeJob(source, candidate, now));
    }
  } catch (error) {
    failures.push({ company: source.company, url: source.url, error: String(error.message || error).slice(0, 180) });
  } finally { await page.close(); }
}
await browser.close();

const deduped = new Map();
for (const job of discovered) deduped.set(stableId(job.company, job.role, job.url), job);
const existingById = new Map(jobs.map((job) => [job.id || stableId(job.company, job.role, job.url), job]));
const added = [];
for (const [id, job] of deduped) {
  const previous = existingById.get(id);
  if (previous) existingById.set(id, { ...previous, ...job, discoveredAt: previous.discoveredAt || now, lastSeenAt: now, missCount: 0 });
  else { existingById.set(id, job); added.push(job); }
}

const archived = [];
for (const [id, job] of existingById) {
  if (deduped.has(id) || !successfulSources.has(job.company) || !job.directLink) continue;
  const missCount = (job.missCount || 0) + 1;
  if (missCount >= 3) {
    archived.push({ company: job.company, role: job.role, city: job.city, archivedAt: day.slice(0, 10), reason: "连续3次成功核查未再发现该独立岗位，已移入待复核归档", url: job.url });
    existingById.delete(id);
  } else existingById.set(id, { ...job, missCount });
}

const nextJobs = [...existingById.values()].sort((a, b) => b.match - a.match || a.company.localeCompare(b.company, "zh-CN"));
history.archivedJobs = [...archived, ...history.archivedJobs];
history.changeLog = [{
  date: day, type: archived.length ? "归档" : added.length ? "新增" : "更新",
  title: added.length || archived.length ? `自动核查：新增${added.length}条，归档${archived.length}条` : "自动核查完成：暂无确定变更",
  detail: `成功读取${successfulSources.size}/${sources.length}个公开来源；失败${failures.length}个。只有满足2027届、正式校招、广东和岗位方向规则的候选才会入库。`
}, ...history.changeLog].slice(0, 180);

await writeJson("data/jobs.json", nextJobs);
await writeJson("data/history.json", history);
await writeJson("data/meta.json", {
  lastSuccessfulCheck: now, lastRunStatus: failures.length === sources.length ? "failed" : failures.length ? "partial" : "success",
  sourceCount: sources.length, successfulSourceCount: successfulSources.size, failedSources: failures,
  activeCount: nextJobs.length, archivedCount: history.archivedJobs.length, addedCount: added.length, archivedThisRun: archived.length
});
if (failures.length === sources.length) throw new Error("所有来源均读取失败；已保留现有岗位数据，但本次运行不应部署");
console.log(`完成：${successfulSources.size}/${sources.length}个来源，新增${added.length}，归档${archived.length}，当前${nextJobs.length}。`);
