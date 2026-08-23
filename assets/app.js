import { bucketForStatus, statusCounts, statusOptions } from "./status.js";

const $ = (selector) => document.querySelector(selector);
const saved = JSON.parse(localStorage.getItem("ruixuan-status-v3") || "{}");
let activeView = "pending";
const [jobs, history, meta] = await Promise.all(["jobs.json", "history.json", "meta.json"].map((file) => fetch(`data/${file}?v=${Date.now()}`).then((response) => { if (!response.ok) throw new Error(file); return response.json(); })));

const confidenceOf = (job) => job.confidence || ((job.confidenceRank || 2) === 2 ? "已核验具体岗位" : "待官网核验");
const verifiedCount = jobs.filter((job) => (job.confidenceRank || 2) === 2).length;
const date = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(meta.lastSuccessfulCheck));
$("#updatedAt").textContent = `最近成功核查：${date}`;
$("#activeCount").textContent = jobs.length;
$("#verifiedCount").textContent = meta.verifiedCount ?? verifiedCount;
$("#sourceCount").textContent = meta.sourceCount || "—";
$("#appliedCount").textContent = Object.values(saved).filter((value) => ["已投递", "已笔试", "已面试"].includes(value)).length;
$("#healthText").textContent = meta.lastRunStatus === "success" ? "全部来源核查成功" : meta.lastRunStatus === "partial" ? `已更新，${meta.failedSources?.length || 0}个来源稍后重试` : "当前展示最近一次可靠数据";
$("#healthDot").className = meta.lastRunStatus === "partial" ? "partial" : meta.lastRunStatus === "failed" ? "failed" : "";

for (const track of [...new Set(jobs.map((job) => job.track))]) $("#track").insertAdjacentHTML("beforeend", `<option>${track}</option>`);

function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function updateViewCounts() {
  const counts = statusCounts(jobs, saved);
  $("#pendingViewCount").textContent = counts.pending;
  $("#appliedViewCount").textContent = counts.applied;
  $("#passedViewCount").textContent = counts.passed;
  $("#appliedCount").textContent = counts.applied;
}
function render() {
  const query = $("#query").value.trim().toLowerCase();
  const priority = $("#priority").value, track = $("#track").value, confidence = $("#confidence").value, city = $("#city").value, state = $("#status").value;
  const list = jobs.filter((job) => {
    const text = `${job.company} ${job.role} ${job.track} ${(job.skills || []).join(" ")}`.toLowerCase();
    const jobStatus = saved[job.id] || "未投递";
    return bucketForStatus(jobStatus) === activeView && text.includes(query) && (priority === "全部优先级" || job.priority === priority) && (track === "全部方向" || job.track === track) && (confidence === "全部可信度" || confidenceOf(job) === confidence) && (city === "全部城市" || job.city.includes(city)) && (state === "全部状态" || jobStatus === state);
  });
  $("#visibleCount").textContent = list.length; $("#empty").hidden = list.length > 0;
  $("#jobGrid").innerHTML = list.map((job) => {
    const confidence = confidenceOf(job), isLead = confidence === "待官网核验";
    return `<article class="job-card ${job.priority === "优先投递" ? "top" : ""}">
      <div class="card-head"><div class="company"><span>${escapeHtml(job.company.slice(0, 1))}</span><div><h3>${escapeHtml(job.company)}</h3><p>${escapeHtml(job.employerType || "规模企业")} · ${escapeHtml(job.city)}</p></div></div><div class="score"><strong>${job.match}</strong><small>匹配</small></div></div>
      <div class="badges"><b>${escapeHtml(job.priority)}</b><span>${escapeHtml(job.track)}</span><span>${escapeHtml(job.type)}</span><span class="confidence ${isLead ? "lead" : ""}">${isLead ? "△" : "✓"} ${escapeHtml(confidence)}</span></div>
      <h4>${escapeHtml(job.role)}</h4><p class="why">${escapeHtml(job.why)}</p>
      <div class="skills">${(job.skills || []).map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>
      <div class="source"><span>● ${escapeHtml(job.source)}</span><small>${job.directLink ? "独立岗位页" : "招聘入口"}</small></div>
      <div class="actions"><label>投递状态<select data-id="${job.id}">${statusOptions.map((item) => `<option ${item === (saved[job.id] || "未投递") ? "selected" : ""}>${item}</option>`).join("")}</select></label><div class="job-buttons"><button class="tailor-button" type="button" data-tailor="${escapeHtml(job.id)}">编辑简历</button><a href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer">${job.directLink ? "直达岗位" : "打开招聘入口"} ↗</a></div></div>
    </article>`;
  }).join("");
  document.querySelectorAll("select[data-id]").forEach((select) => select.addEventListener("change", () => {
    saved[select.dataset.id] = select.value;
    localStorage.setItem("ruixuan-status-v3", JSON.stringify(saved));
    updateViewCounts();
    render();
  }));
  document.querySelectorAll("[data-tailor]").forEach((button) => button.addEventListener("click", () => {
    const job = jobs.find((item) => item.id === button.dataset.tailor);
    window.dispatchEvent(new CustomEvent("open-resume-lab", { detail: job }));
  }));
}
for (const selector of ["#query", "#priority", "#track", "#confidence", "#city", "#status"]) $(selector).addEventListener(selector === "#query" ? "input" : "change", render);
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  activeView = button.dataset.view;
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item === button));
  $("#status").value = "全部状态";
  render();
}));
$("#changeLog").innerHTML = history.changeLog.slice(0, 12).map((item) => `<li><time>${escapeHtml(item.date)}</time><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.detail)}</p></li>`).join("");
$("#archiveList").innerHTML = history.archivedJobs.length ? history.archivedJobs.slice(0, 20).map((job) => `<article><div><b>${escapeHtml(job.company)}</b><p>${escapeHtml(job.role)}</p><small>${escapeHtml(job.city)} · ${escapeHtml(job.reason)}</small></div><a href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer">原页面 ↗</a></article>`).join("") : "<p>暂无归档岗位</p>";
updateViewCounts();
render();
