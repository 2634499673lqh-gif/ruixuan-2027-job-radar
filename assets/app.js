const $ = (selector) => document.querySelector(selector);
const statusOptions = ["未投递", "准备中", "已投递", "已笔试", "已面试", "已挂", "暂不投递"];
const saved = JSON.parse(localStorage.getItem("ruixuan-status-v3") || "{}");
const [jobs, history, meta] = await Promise.all(["jobs.json", "history.json", "meta.json"].map((file) => fetch(`data/${file}?v=${Date.now()}`).then((response) => { if (!response.ok) throw new Error(file); return response.json(); })));

const date = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(meta.lastSuccessfulCheck));
$("#updatedAt").textContent = `最近成功核查：${date}`;
$("#activeCount").textContent = jobs.length;
$("#priorityCount").textContent = jobs.filter((job) => job.priority === "优先投递").length;
$("#sourceCount").textContent = meta.sourceCount || "—";
$("#appliedCount").textContent = Object.values(saved).filter((value) => ["已投递", "已笔试", "已面试"].includes(value)).length;
$("#healthText").textContent = meta.lastRunStatus === "success" ? "全部来源核查成功" : meta.lastRunStatus === "partial" ? `已更新，${meta.failedSources?.length || 0}个来源稍后重试` : "当前展示最近一次可靠数据";
$("#healthDot").className = meta.lastRunStatus === "partial" ? "partial" : meta.lastRunStatus === "failed" ? "failed" : "";

for (const track of [...new Set(jobs.map((job) => job.track))]) $("#track").insertAdjacentHTML("beforeend", `<option>${track}</option>`);

function escapeHtml(value = "") { return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function render() {
  const query = $("#query").value.trim().toLowerCase();
  const priority = $("#priority").value, track = $("#track").value, city = $("#city").value, state = $("#status").value;
  const list = jobs.filter((job) => {
    const text = `${job.company} ${job.role} ${job.track} ${(job.skills || []).join(" ")}`.toLowerCase();
    return text.includes(query) && (priority === "全部优先级" || job.priority === priority) && (track === "全部方向" || job.track === track) && (city === "全部城市" || job.city.includes(city)) && (state === "全部状态" || (saved[job.id] || "未投递") === state);
  });
  $("#visibleCount").textContent = list.length; $("#empty").hidden = list.length > 0;
  $("#jobGrid").innerHTML = list.map((job) => `<article class="job-card ${job.priority === "优先投递" ? "top" : ""}">
    <div class="card-head"><div class="company"><span>${escapeHtml(job.company.slice(0, 1))}</span><div><h3>${escapeHtml(job.company)}</h3><p>${escapeHtml(job.employerType || "规模企业")} · ${escapeHtml(job.city)}</p></div></div><div class="score"><strong>${job.match}</strong><small>匹配</small></div></div>
    <div class="badges"><b>${escapeHtml(job.priority)}</b><span>${escapeHtml(job.track)}</span><span>${escapeHtml(job.type)}</span></div>
    <h4>${escapeHtml(job.role)}</h4><p class="why">${escapeHtml(job.why)}</p>
    <div class="skills">${(job.skills || []).map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>
    <div class="source"><span>● ${escapeHtml(job.source)}</span><small>${job.directLink ? "独立岗位页" : "招聘入口"}</small></div>
    <div class="actions"><label>投递状态<select data-id="${job.id}">${statusOptions.map((item) => `<option ${item === (saved[job.id] || "未投递") ? "selected" : ""}>${item}</option>`).join("")}</select></label><a href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer">${job.directLink ? "直达岗位" : "打开招聘入口"} ↗</a></div>
  </article>`).join("");
  document.querySelectorAll("select[data-id]").forEach((select) => select.addEventListener("change", () => { saved[select.dataset.id] = select.value; localStorage.setItem("ruixuan-status-v3", JSON.stringify(saved)); $("#appliedCount").textContent = Object.values(saved).filter((value) => ["已投递", "已笔试", "已面试"].includes(value)).length; }));
}
for (const selector of ["#query", "#priority", "#track", "#city", "#status"]) $(selector).addEventListener(selector === "#query" ? "input" : "change", render);
$("#changeLog").innerHTML = history.changeLog.slice(0, 12).map((item) => `<li><time>${escapeHtml(item.date)}</time><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.detail)}</p></li>`).join("");
$("#archiveList").innerHTML = history.archivedJobs.length ? history.archivedJobs.slice(0, 20).map((job) => `<article><div><b>${escapeHtml(job.company)}</b><p>${escapeHtml(job.role)}</p><small>${escapeHtml(job.city)} · ${escapeHtml(job.reason)}</small></div><a href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer">原页面 ↗</a></article>`).join("") : "<p>暂无归档岗位</p>";
render();
