const lab = document.querySelector("#resumeLab");
const $ = (selector) => lab.querySelector(selector);
const storageKey = "ruixuan-master-resume-v1";
let engine;
let suggestions = [];

$("#resumeText").value = localStorage.getItem(storageKey) || "";
document.querySelector("#openResumeLab").addEventListener("click", () => lab.showModal());
window.addEventListener("open-resume-lab", ({ detail: job }) => {
  $("#targetCompany").value = job.company || "";
  $("#targetRole").value = job.role || "";
  $("#targetJd").value = [job.role, job.why, ...(job.skills || [])].filter(Boolean).join("\n");
  lab.showModal();
});

$("#saveResume").addEventListener("click", () => {
  localStorage.setItem(storageKey, $("#resumeText").value.trim());
  $("#resumeSavedHint").textContent = "已保存到当前浏览器";
});

$("#resumeFile").addEventListener("change", async ({ target }) => {
  const file = target.files[0];
  if (!file) return;
  setStatus(`正在本地读取 ${file.name}…`);
  try {
    const suffix = file.name.split(".").pop().toLowerCase();
    if (["txt", "md"].includes(suffix)) $("#resumeText").value = await file.text();
    else if (suffix === "docx") {
      const mammothModule = await import("https://esm.sh/mammoth@1.9.0/mammoth.browser.min.js");
      const mammoth = mammothModule.default || mammothModule;
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      $("#resumeText").value = result.value;
    } else if (suffix === "pdf") {
      const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = [];
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        const content = await (await pdf.getPage(pageNo)).getTextContent();
        pages.push(content.items.map((item) => item.str).join(" "));
      }
      $("#resumeText").value = pages.join("\n");
    } else throw new Error("暂不支持这个文件格式");
    localStorage.setItem(storageKey, $("#resumeText").value.trim());
    setStatus("读取完成，简历已保存在当前浏览器");
  } catch (error) { setStatus(`读取失败：${error.message}`, true); }
});

function setStatus(message, failed = false) {
  $("#aiStatus").textContent = message;
  $("#aiStatus").classList.toggle("error", failed);
}

async function loadEngine() {
  if (engine) return engine;
  if (!navigator.gpu) throw new Error("当前浏览器或显卡未启用 WebGPU，请使用最新版 Edge 并更新显卡驱动");
  if (!confirm("首次使用需要下载约 1–2GB 的免费本地模型。下载后会缓存在本机，简历不会上传。现在继续吗？")) throw new Error("已取消模型下载");
  const webllm = await import("https://esm.run/@mlc-ai/web-llm");
  const progress = $("#aiProgress");
  progress.hidden = false;
  const model = webllm.prebuiltAppConfig.model_list.find((item) => /Qwen2\.5-1\.5B-Instruct/i.test(item.model_id))?.model_id;
  if (!model) throw new Error("本地模型列表暂不可用，请稍后重试");
  engine = await webllm.CreateMLCEngine(model, { initProgressCallback: ({ progress: value, text }) => {
    progress.value = value || 0;
    setStatus(text || `模型加载 ${Math.round((value || 0) * 100)}%`);
  }});
  progress.hidden = true;
  setStatus("本地 AI 已就绪，后续使用无需重复下载");
  return engine;
}

$("#generateResume").addEventListener("click", async () => {
  const resume = $("#resumeText").value.trim();
  const jd = $("#targetJd").value.trim();
  if (resume.length < 80) return setStatus("请先填写较完整的基础简历", true);
  if (jd.length < 20) return setStatus("请先补充目标岗位信息", true);
  $("#generateResume").disabled = true;
  try {
    const ai = await loadEngine();
    setStatus("正在本机生成建议，请不要关闭页面……");
    const response = await ai.chat.completions.create({ temperature: 0.15, response_format: { type: "json_object" }, messages: [
      { role: "system", content: "你是严谨的中文应届生简历编辑。只能改写用户简历中明确存在的事实，严禁虚构经历、技能、职责、数据或成果。岗位要求但简历没有的内容只能列入gaps。输出严格JSON：{suggestions:[{original:string,revised:string,reason:string,evidence:string}],gaps:[string]}。每项evidence必须引用原简历短语；无证据不建议；最多8项。" },
      { role: "user", content: `目标企业：${$("#targetCompany").value}\n目标岗位：${$("#targetRole").value}\n岗位信息：\n${jd}\n\n原始简历：\n${resume}` }
    ]});
    const data = JSON.parse(response.choices[0].message.content.replace(/^```json\s*|\s*```$/g, ""));
    suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    renderSuggestions(suggestions, data.gaps || []);
    setStatus(`已生成 ${suggestions.length} 条建议，请逐条核对后采纳`);
  } catch (error) { setStatus(`生成失败：${error.message}`, true); }
  finally { $("#generateResume").disabled = false; }
});

function renderSuggestions(items, gaps) {
  $("#suggestionArea").hidden = false;
  $("#gapList").innerHTML = gaps.length ? `<strong>岗位差距（不会擅自写进简历）</strong><ul>${gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul>` : "";
  $("#suggestionList").innerHTML = items.map((item, index) => `<article class="resume-suggestion" data-index="${index}"><label><input type="checkbox"> 采纳此项</label><div class="diff"><div><small>原文</small><p>${escapeHtml(item.original)}</p></div><div><small>建议改为</small><textarea rows="3">${escapeHtml(item.revised)}</textarea></div></div><p class="reason">${escapeHtml(item.reason)} · 依据：${escapeHtml(item.evidence)}</p></article>`).join("");
}

$("#acceptAll").addEventListener("click", () => lab.querySelectorAll(".resume-suggestion input").forEach((item) => { item.checked = true; }));
$("#exportResume").addEventListener("click", () => {
  let text = $("#resumeText").value;
  lab.querySelectorAll(".resume-suggestion").forEach((card) => {
    if (!card.querySelector("input").checked) return;
    const item = suggestions[Number(card.dataset.index)];
    text = text.replace(item.original, card.querySelector("textarea").value.trim());
  });
  const printable = window.open("", "_blank");
  if (!printable) return setStatus("浏览器阻止了打印窗口，请允许本站弹出窗口", true);
  printable.document.write(`<title>${escapeHtml($("#targetCompany").value)}-${escapeHtml($("#targetRole").value)}-定制简历</title><style>@page{size:A4;margin:16mm}body{font:14px/1.75 'Microsoft YaHei',sans-serif;color:#172f29;white-space:pre-wrap}h1{font-size:18px;border-bottom:2px solid #173e34;padding-bottom:8px}</style><h1>${escapeHtml($("#targetCompany").value)} · ${escapeHtml($("#targetRole").value)} 定制简历</h1><div>${escapeHtml(text)}</div>`);
  printable.document.close(); printable.focus(); setTimeout(() => printable.print(), 250);
});

function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
