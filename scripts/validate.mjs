import fs from "node:fs/promises";
import { guangdongTerms, internshipTerms, isLikelyRoleTitle } from "./rules.mjs";

const jobs = JSON.parse(await fs.readFile(new URL("../data/jobs.json", import.meta.url), "utf8"));
const ids = new Set();
const errors = [];
for (const [index, job] of jobs.entries()) {
  for (const field of ["id", "company", "role", "city", "track", "type", "priority", "match", "url"]) if (job[field] === undefined || job[field] === "") errors.push(`#${index + 1} 缺少 ${field}`);
  if (ids.has(job.id)) errors.push(`重复ID：${job.id}`); ids.add(job.id);
  if (!guangdongTerms.some((term) => job.city.includes(term))) errors.push(`${job.company} 地点非广东：${job.city}`);
  if (internshipTerms.some((term) => `${job.role} ${job.type}`.toLowerCase().includes(term.toLowerCase()))) errors.push(`${job.company} 疑似实习：${job.role}`);
  if (!/^https?:\/\//.test(job.url)) errors.push(`${job.company} 链接无效：${job.url}`);
  if (job.confidenceRank !== undefined && ![1, 2].includes(job.confidenceRank)) errors.push(`${job.company} 可信度等级无效`);
  if (!isLikelyRoleTitle(job.role)) errors.push(`${job.company} 岗位名称疑似介绍或分类文字：${job.role}`);
}
if (jobs.length < 10) errors.push(`活动岗位仅${jobs.length}条，触发防空保护`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`验证通过：${jobs.length}条岗位，ID、地点、岗位性质与链接格式正常。`);
