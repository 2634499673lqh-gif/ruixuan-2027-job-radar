const lab = document.querySelector("#resumeLab");
const $ = (selector) => lab.querySelector(selector);
const storageKey = "ruixuan-resume-editor-v2";
let sourceUrl = "";
let currentFileName = "定制简历";

$("#resumeEditor").innerHTML = localStorage.getItem(storageKey) || "";
document.querySelector("#openResumeLab").addEventListener("click", () => openLab());
window.addEventListener("open-resume-lab", ({ detail: job }) => openLab(job));

function openLab(job) {
  if (job) {
    $("#editorJobContext").textContent = `正在为「${job.company} — ${job.role}」修改简历`;
    currentFileName = safeName(`${job.company}-${job.role}-定制简历`);
  } else {
    $("#editorJobContext").textContent = "上传简历后，在右侧边看原稿边修改；文件不会上传。";
    currentFileName = "定制简历";
  }
  lab.showModal();
}

$("#resumeFile").addEventListener("change", async ({ target }) => {
  const file = target.files[0];
  if (!file) return;
  currentFileName = currentFileName === "定制简历" ? safeName(file.name.replace(/\.[^.]+$/, "") + "-编辑版") : currentFileName;
  setStatus(`正在本地读取 ${file.name}…`);
  try {
    const suffix = file.name.split(".").pop().toLowerCase();
    revokeSource();
    if (suffix === "pdf") await importPdf(file);
    else if (suffix === "docx") await importDocx(file);
    else if (["txt", "md"].includes(suffix)) importPlain(await file.text(), suffix);
    else throw new Error("暂不支持这个文件格式");
    persist();
  } catch (error) { setStatus(`读取失败：${error.message}`, true); }
});

async function importPdf(file) {
  sourceUrl = URL.createObjectURL(file);
  $("#sourcePdf").src = sourceUrl;
  $("#sourcePdf").hidden = false;
  $("#sourceEmpty").hidden = true;
  const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageHtml = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const lines = groupPdfLines(content.items);
    pageHtml.push(`<section class="imported-page">${lines.map(lineToHtml).join("")}</section>`);
  }
  $("#resumeEditor").innerHTML = pageHtml.join("");
  $("#fidelityHint").textContent = "PDF 已重建 · 左侧对照原稿";
  setStatus("PDF 已在本地转换。复杂分栏和图形可能需要少量调整。", false);
}

function groupPdfLines(items) {
  const rows = [];
  for (const item of items.filter((entry) => entry.str?.trim())) {
    const y = Math.round(item.transform?.[5] || 0);
    let row = rows.find((entry) => Math.abs(entry.y - y) <= 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  return rows.sort((a, b) => b.y - a.y).map((row) => {
    row.items.sort((a, b) => (a.transform?.[4] || 0) - (b.transform?.[4] || 0));
    return { text: row.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim(), size: Math.max(...row.items.map((item) => Math.abs(item.transform?.[0] || item.height || 11))) };
  });
}

function lineToHtml(line) {
  const tag = line.size >= 17 ? "h2" : line.size >= 13.5 ? "h3" : "p";
  return `<${tag}>${escapeHtml(line.text)}</${tag}>`;
}

async function importDocx(file) {
  const mammothModule = await import("https://esm.sh/mammoth@1.9.0/mammoth.browser.min.js");
  const mammoth = mammothModule.default || mammothModule;
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  $("#resumeEditor").innerHTML = `<section class="imported-page">${result.value}</section>`;
  $("#sourcePdf").hidden = true;
  $("#sourceEmpty").hidden = false;
  $("#sourceEmpty").innerHTML = "<b>DOCX 已转换为可编辑版本</b><span>标题、粗体、列表和表格会尽量保留；左侧 PDF 对照仅在上传 PDF 时显示。</span>";
  $("#fidelityHint").textContent = "DOCX 模式 · 格式保留更好";
  setStatus(result.messages.length ? "DOCX 已转换，建议检查复杂文本框或图片位置。" : "DOCX 已转换，可以直接修改。", false);
}

function importPlain(text, suffix) {
  $("#resumeEditor").innerHTML = `<section class="imported-page">${text.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`).join("")}</section>`;
  $("#fidelityHint").textContent = suffix === "md" ? "Markdown 文本" : "纯文本";
  setStatus("文本已载入，可以直接修改。", false);
}

$("#resumeEditor").addEventListener("input", persist);
function persist() { localStorage.setItem(storageKey, $("#resumeEditor").innerHTML); }
function setStatus(message, failed = false) { $("#fileStatus").textContent = message; $("#fileStatus").classList.toggle("error", failed); }

lab.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => { document.execCommand(button.dataset.command, false); $("#resumeEditor").focus(); persist(); }));
$("#blockFormat").addEventListener("change", ({ target }) => { document.execCommand("formatBlock", false, target.value); $("#resumeEditor").focus(); persist(); });

$("#clearDocument").addEventListener("click", () => {
  if (!confirm("清空当前编辑内容和本地保存的简历？")) return;
  $("#resumeEditor").innerHTML = ""; localStorage.removeItem(storageKey); revokeSource();
  $("#sourcePdf").hidden = true; $("#sourceEmpty").hidden = false; $("#sourceEmpty").textContent = "上传后在这里显示原 PDF；DOCX 将直接转换为编辑版。";
  $("#fidelityHint").textContent = "等待上传"; setStatus("已清空");
});

$("#exportMarkdown").addEventListener("click", () => download(`${currentFileName}.md`, toMarkdown($("#resumeEditor")), "text/markdown;charset=utf-8"));
$("#exportWord").addEventListener("click", () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${printStyles()}</style></head><body>${$("#resumeEditor").innerHTML}</body></html>`;
  download(`${currentFileName}.doc`, "\ufeff" + html, "application/msword;charset=utf-8");
});
$("#exportPdf").addEventListener("click", () => {
  if (!$("#resumeEditor").innerText.trim()) return setStatus("请先上传或填写简历内容", true);
  const printable = window.open("", "_blank");
  if (!printable) return setStatus("浏览器阻止了打印窗口，请允许本站弹出窗口", true);
  printable.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(currentFileName)}</title><style>${printStyles()}</style></head><body>${$("#resumeEditor").innerHTML}</body></html>`);
  printable.document.close(); printable.focus(); setTimeout(() => printable.print(), 300);
});

function toMarkdown(root) {
  return [...root.querySelectorAll("h1,h2,h3,p,li")].map((node) => {
    const text = node.innerText.trim(); if (!text) return "";
    if (node.tagName === "H1") return `# ${text}`; if (node.tagName === "H2") return `## ${text}`; if (node.tagName === "H3") return `### ${text}`; if (node.tagName === "LI") return `- ${text}`; return text;
  }).filter(Boolean).join("\n\n");
}
function printStyles() { return "@page{size:A4;margin:13mm}*{box-sizing:border-box}body{width:184mm;margin:0 auto;color:#172f29;font:10.5pt/1.55 'Microsoft YaHei','Noto Sans CJK SC',Arial,sans-serif}section.imported-page{min-height:270mm;break-after:page;padding:0}section.imported-page:last-child{break-after:auto}h1,h2,h3{color:#123e34;margin:10px 0 5px}h2{font-size:16pt;border-bottom:1.5px solid #224f43;padding-bottom:3px}h3{font-size:12pt}p{margin:3px 0;white-space:pre-wrap}ul,ol{margin:4px 0;padding-left:20px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccd4cf;padding:5px}img{max-width:100%}"; }
function download(name, content, type) { const url=URL.createObjectURL(new Blob([content],{type})); const link=document.createElement("a"); link.href=url; link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function revokeSource() { if(sourceUrl) URL.revokeObjectURL(sourceUrl); sourceUrl=""; $("#sourcePdf").removeAttribute("src"); }
function safeName(value) { return value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 90); }
function escapeHtml(value="") { return String(value).replace(/[&<>'"]/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]); }
