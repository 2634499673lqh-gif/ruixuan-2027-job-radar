const lab = document.querySelector("#resumeLab");
const $ = (selector) => lab.querySelector(selector);
const storageKey = "ruixuan-resume-editor-v2";
let sourceUrl = "", currentFileName = "定制简历", pdfjs, pdfDocument, selectedBlock;
let pageRecords = [], activeMode = "layout", activeTemplate, templateSaveTimer;

$("#resumeEditor").innerHTML = localStorage.getItem(storageKey) || "";
document.querySelector("#openResumeLab").addEventListener("click", () => openLab());
window.addEventListener("open-resume-lab", ({ detail: job }) => openLab(job));
function openLab(job) {
  $("#editorJobContext").textContent = job ? `正在为「${job.company} — ${job.role}」修改简历` : "每个人上传一次自己的 PDF，以后直接选择模板、修改并导出。";
  currentFileName = job ? safeName(`${job.company}-${job.role}-定制简历`) : "定制简历";
  lab.showModal();
}

lab.querySelectorAll("[data-editor-mode]").forEach((button) => button.addEventListener("click", () => switchMode(button.dataset.editorMode)));
function switchMode(mode) {
  activeMode = mode;
  lab.querySelectorAll("[data-editor-mode]").forEach((button) => button.classList.toggle("active", button.dataset.editorMode === mode));
  $("#layoutWorkspace").hidden = mode !== "layout"; $("#reflowWorkspace").hidden = mode !== "reflow";
  lab.querySelectorAll(".reflow-export").forEach((button) => button.hidden = mode !== "reflow");
  $("#exportPdf").textContent = mode === "layout" ? "导出原版式 PDF" : "打印 / 导出 PDF";
  $("#saveModeText").textContent = mode === "layout" ? "原版式模式：照片和图形不变，只覆盖修改文字" : "内容重排模式：适合大幅增删内容";
  $("#exportHint").textContent = mode === "layout" ? "导出的 PDF 会高清扁平化，避免中文乱码。" : "复杂 PDF 样式可能无法完整保留，建议对照左侧原稿。";
}
switchMode("layout");

$("#resumeFile").addEventListener("change", async ({ target }) => {
  const file = target.files[0]; if (!file) return;
  currentFileName = currentFileName === "定制简历" ? safeName(file.name.replace(/\.[^.]+$/, "") + "-编辑版") : currentFileName;
  setStatus(`正在本地读取 ${file.name}…`);
  try {
    const suffix = file.name.split(".").pop().toLowerCase(); revokeSource();
    if (suffix === "pdf") { await importPdf(file); await createTemplate(file); }
    else if (suffix === "docx") { await importDocx(file); switchMode("reflow"); }
    else if (["txt", "md"].includes(suffix)) { importPlain(await file.text(), suffix); switchMode("reflow"); }
    else throw new Error("暂不支持这个文件格式");
    persist();
  } catch (error) { setStatus(`读取失败：${error.message}`, true); }
});

async function importPdf(file) {
  sourceUrl = URL.createObjectURL(file); $("#sourcePdf").src = sourceUrl; $("#sourcePdf").hidden = false; $("#sourceEmpty").hidden = true;
  pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  pdfDocument = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  pageRecords = []; selectedBlock = null; $("#pdfPages").innerHTML = "";
  for (let pageNo = 1; pageNo <= pdfDocument.numPages; pageNo++) await renderLayoutPage(await pdfDocument.getPage(pageNo), pageNo);
  const reflowPages = pageRecords.map((record) => `<section class="imported-page">${record.blocks.map(lineToHtml).join("")}</section>`);
  $("#resumeEditor").innerHTML = reflowPages.join(""); $("#fidelityHint").textContent = "PDF 重排版 · 左侧对照原稿";
  switchMode("layout"); applyPrivacy(); setStatus(`PDF 已载入，共 ${pdfDocument.numPages} 页。点击页面文字即可修改。`);
}

async function renderLayoutPage(page, pageNo) {
  const scale = 2, viewport = page.getViewport({ scale });
  const shell = document.createElement("article"); shell.className = "pdf-edit-page"; shell.style.width = `${viewport.width}px`; shell.style.height = `${viewport.height}px`;
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const overlay = document.createElement("div"); overlay.className = "pdf-text-overlay";
  shell.append(canvas, overlay); $("#pdfPages").append(shell);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  const content = await page.getTextContent();
  const blocks = groupPdfLines(content.items, viewport, canvas, pageNo);
  const record = { pageNo, canvas, viewport, blocks, pdfWidth: page.view[2], pdfHeight: page.view[3] }; pageRecords.push(record);
  for (const block of blocks) {
    const button = document.createElement("button"); button.type = "button"; button.className = "pdf-text-block"; button.title = block.original;
    Object.assign(button.style, { left:`${block.x}px`, top:`${block.y}px`, width:`${block.width}px`, height:`${block.height}px`, fontSize:`${block.fontSize}px` });
    button.addEventListener("click", () => selectBlock(block, button)); block.element = button; overlay.append(button);
  }
}

function groupPdfLines(items, viewport, canvas, pageNo) {
  const fragments = items.filter((item) => item.str?.trim()).map((item) => {
    const tx = pdfjs.Util.transform(viewport.transform, item.transform); const fontSize = Math.max(8, Math.hypot(tx[2], tx[3]));
    return { text:item.str, x:tx[4], y:tx[5]-fontSize, width:Math.max(item.width*viewport.scale, 5), height:fontSize*1.25, fontSize };
  });
  const rows=[];
  for(const fragment of fragments.sort((a,b)=>a.y-b.y||a.x-b.x)){let row=rows.find((entry)=>Math.abs(entry.y-fragment.y)<Math.max(3,fragment.fontSize*.3));if(!row){row={y:fragment.y,items:[]};rows.push(row)}row.items.push(fragment)}
  return rows.map((row,index)=>{row.items.sort((a,b)=>a.x-b.x);const x=Math.min(...row.items.map(i=>i.x)),end=Math.max(...row.items.map(i=>i.x+i.width)),fontSize=Math.max(...row.items.map(i=>i.fontSize)),height=Math.max(...row.items.map(i=>i.height));const text=row.items.map(i=>i.text).join(" ").replace(/\s+/g," ").trim();return {id:`${pageNo}-${index}`,pageNo,original:text,text,x,y:Math.min(...row.items.map(i=>i.y)),width:Math.max(end-x,60),height:Math.max(height,16),fontSize,color:"#172f29",background:sampleBackground(canvas,x,row.y,end-x,height),modified:false,baseWidth:Math.max(end-x,60),baseFontSize:fontSize}});
}
function sampleBackground(canvas,x,y,w,h){const ctx=canvas.getContext("2d"),points=[[x-2,y+h/2],[x+w+2,y+h/2],[x+w/2,y-2],[x+w/2,y+h+2]];let r=0,g=0,b=0,n=0;for(const [px,py] of points){if(px<0||py<0||px>=canvas.width||py>=canvas.height)continue;const d=ctx.getImageData(Math.floor(px),Math.floor(py),1,1).data;r+=d[0];g+=d[1];b+=d[2];n++}return n?`rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`:"white"}
function lineToHtml(block){const tag=block.fontSize>=30?"h2":block.fontSize>=23?"h3":"p";return `<${tag}>${escapeHtml(block.original)}</${tag}>`}

function selectBlock(block, element) {
  lab.querySelectorAll(".pdf-text-block.selected").forEach((item)=>item.classList.remove("selected")); element.classList.add("selected"); selectedBlock=block;
  $("#blockEmpty").hidden=true; $("#blockForm").hidden=false; $("#blockPosition").textContent=`第 ${block.pageNo} 页`;
  $("#originalBlockText").value=block.original; $("#editedBlockText").value=block.text; $("#blockFontSize").value=(block.fontSize/2).toFixed(1); $("#blockColor").value=block.color;
  $("#blockWidth").max=Math.max(80,Math.floor(pageRecords[block.pageNo-1].canvas.width-block.x-8)); $("#blockWidth").value=block.width; updateOverflowHint();
}
$("#editedBlockText").addEventListener("input",updateOverflowHint); $("#blockFontSize").addEventListener("input",updateOverflowHint); $("#blockWidth").addEventListener("input",updateOverflowHint);
function textWidth(block,text,size){const ctx=pageRecords[block.pageNo-1].canvas.getContext("2d");ctx.font=`${size}px Microsoft YaHei, sans-serif`;return ctx.measureText(text).width}function updateOverflowHint(){if(!selectedBlock)return;const size=Number($("#blockFontSize").value)*2,width=Number($("#blockWidth").value),required=textWidth(selectedBlock,$("#editedBlockText").value,size);const overflow=required>width;$("#overflowHint").textContent=overflow?`当前文字需要约 ${Math.ceil(required)}px；请扩大文本框、减小字号或缩短内容。`:"长度正常，可在页面中预览。";$("#overflowHint").classList.toggle("warning",overflow)}
$("#applyBlock").addEventListener("click",()=>{if(!selectedBlock)return;const text=$("#editedBlockText").value.trim(),record=pageRecords[selectedBlock.pageNo-1],maxWidth=record.canvas.width-selectedBlock.x-8;let fontSize=Number($("#blockFontSize").value)*2,width=Number($("#blockWidth").value),required=textWidth(selectedBlock,text,fontSize);if(required>width)width=Math.min(maxWidth,Math.ceil(required+6));if(required>maxWidth){const fitted=fontSize*maxWidth/required;if(fitted<selectedBlock.fontSize*.75){$("#overflowHint").textContent="文字过长，自动缩小后仍会影响阅读。请缩短内容后再应用。";$("#overflowHint").classList.add("warning");return}fontSize=fitted;width=maxWidth}selectedBlock.text=text;selectedBlock.fontSize=fontSize;selectedBlock.width=width;selectedBlock.color=$("#blockColor").value;selectedBlock.modified=text!==selectedBlock.original;$("#blockFontSize").value=(fontSize/2).toFixed(1);$("#blockWidth").value=width;renderBlock(selectedBlock);updateOverflowHint();setStatus(`已应用第 ${selectedBlock.pageNo} 页的文字修改`);scheduleTemplateSave()});
$("#resetBlock").addEventListener("click",()=>{if(!selectedBlock)return;selectedBlock.text=selectedBlock.original;selectedBlock.modified=false;selectedBlock.element.removeAttribute("style");Object.assign(selectedBlock.element.style,{left:`${selectedBlock.x}px`,top:`${selectedBlock.y}px`,width:`${selectedBlock.width}px`,height:`${selectedBlock.height}px`,fontSize:`${selectedBlock.fontSize}px`});$("#editedBlockText").value=selectedBlock.original;setStatus("已恢复原文字");scheduleTemplateSave()});
function renderBlock(block){const el=block.element;el.style.width=`${block.width}px`;el.style.fontSize=`${block.fontSize}px`;el.classList.toggle("modified",block.modified);el.textContent=block.modified?block.text:"";el.style.background=block.modified?block.background:"transparent";el.style.color=block.color;el.style.height=block.modified?"auto":`${block.height}px`;}

async function exportLayoutPdf(){if(!pageRecords.length)return setStatus("请先上传 PDF",true);setStatus("正在本地生成原版式 PDF…");const {jsPDF}=await import("https://esm.sh/jspdf@2.5.2");let doc;for(const [index,record] of pageRecords.entries()){const out=document.createElement("canvas");out.width=record.canvas.width;out.height=record.canvas.height;const ctx=out.getContext("2d");ctx.drawImage(record.canvas,0,0);for(const block of record.blocks.filter(b=>b.modified)){ctx.fillStyle=block.background;ctx.fillRect(block.x-2,block.y-1,block.width+4,Math.max(block.height,block.fontSize*1.3)+2);ctx.fillStyle=block.color;ctx.font=`${block.fontSize}px 'Microsoft YaHei','Noto Sans CJK SC',sans-serif`;ctx.textBaseline="top";ctx.fillText(block.text,block.x,block.y)}const format=[record.pdfWidth,record.pdfHeight];if(!doc)doc=new jsPDF({unit:"pt",format,orientation:record.pdfWidth>record.pdfHeight?"landscape":"portrait",compress:true});else doc.addPage(format,record.pdfWidth>record.pdfHeight?"landscape":"portrait");doc.addImage(out.toDataURL("image/jpeg",.94),"JPEG",0,0,record.pdfWidth,record.pdfHeight,undefined,"FAST")}doc.save(`${currentFileName}.pdf`);setStatus("原版式 PDF 已导出")}


async function importDocx(file){const mod=await import("https://esm.sh/mammoth@1.9.0/mammoth.browser.min.js"),mammoth=mod.default||mod,result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()});$("#resumeEditor").innerHTML=`<section class="imported-page">${result.value}</section>`;$("#sourcePdf").hidden=true;$("#sourceEmpty").hidden=false;$("#sourceEmpty").innerHTML="<b>DOCX 已转换为可编辑版本</b><span>标题、粗体、列表和表格会尽量保留。</span>";$("#fidelityHint").textContent="DOCX 模式";setStatus("DOCX 已转换，可以直接修改。");}
function importPlain(text,suffix){$("#resumeEditor").innerHTML=`<section class="imported-page">${text.split(/\n{2,}/).map(part=>`<p>${escapeHtml(part).replace(/\n/g,"<br>")}</p>`).join("")}</section>`;$("#fidelityHint").textContent=suffix==="md"?"Markdown 文本":"纯文本";setStatus("文本已载入，可以直接修改。");}
$("#resumeEditor").addEventListener("input",persist);function persist(){localStorage.setItem(storageKey,$("#resumeEditor").innerHTML)}function setStatus(message,failed=false){$("#fileStatus").textContent=message;$("#fileStatus").classList.toggle("error",failed)}
lab.querySelectorAll("[data-command]").forEach(button=>button.addEventListener("click",()=>{document.execCommand(button.dataset.command,false);$("#resumeEditor").focus();persist()}));$("#blockFormat").addEventListener("change",({target})=>{document.execCommand("formatBlock",false,target.value);$("#resumeEditor").focus();persist()});
$("#resetTemplateEdits").addEventListener("click",resetTemplateEdits);$("#deleteTemplate").addEventListener("click",deleteActiveTemplate);$("#templateSelect").addEventListener("change",({target})=>target.value&&loadTemplate(target.value));$("#privacyMode").addEventListener("change",applyPrivacy);
$("#exportPdf").addEventListener("click",()=>activeMode==="layout"?exportLayoutPdf():exportReflowPdf());
$("#exportMarkdown").addEventListener("click",()=>download(`${currentFileName}.md`,toMarkdown($("#resumeEditor")),"text/markdown;charset=utf-8"));$("#exportWord").addEventListener("click",()=>download(`${currentFileName}.doc`,"\ufeff"+`<!doctype html><meta charset="utf-8"><style>${printStyles()}</style>${$("#resumeEditor").innerHTML}`,"application/msword;charset=utf-8"));
function exportReflowPdf(){if(!$("#resumeEditor").innerText.trim())return setStatus("请先填写内容",true);const win=window.open("","_blank");if(!win)return setStatus("请允许本站弹出窗口",true);win.document.write(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(currentFileName)}</title><style>${printStyles()}</style>${$("#resumeEditor").innerHTML}`);win.document.close();setTimeout(()=>win.print(),300)}
function toMarkdown(root){return[...root.querySelectorAll("h1,h2,h3,p,li")].map(node=>{const text=node.innerText.trim();if(!text)return"";if(node.tagName==="H2")return`## ${text}`;if(node.tagName==="H3")return`### ${text}`;if(node.tagName==="LI")return`- ${text}`;return text}).filter(Boolean).join("\n\n")}
function printStyles(){return"@page{size:A4;margin:13mm}body{color:#172f29;font:10.5pt/1.55 'Microsoft YaHei',sans-serif}h2{font-size:16pt;border-bottom:1.5px solid #224f43}h3{font-size:12pt}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccd4cf;padding:5px}img{max-width:100%}"}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}function revokeSource(){if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl="";$("#sourcePdf").removeAttribute("src")}function safeName(value){return value.replace(/[\\/:*?"<>|]/g,"-").slice(0,90)}function escapeHtml(value=""){return String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char])}

const templateDb = new Promise((resolve,reject)=>{const request=indexedDB.open("ruixuan-resume-templates",1);request.onupgradeneeded=()=>request.result.createObjectStore("templates",{keyPath:"id"});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
function dbResult(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function templateStore(mode="readonly"){return (await templateDb).transaction("templates",mode).objectStore("templates")}
async function listTemplates(){return dbResult((await templateStore()).getAll())}
async function getTemplate(id){return dbResult((await templateStore()).get(id))}
async function putTemplate(record){return dbResult((await templateStore("readwrite")).put(record))}
async function removeTemplate(id){return dbResult((await templateStore("readwrite")).delete(id))}
async function refreshTemplateSelect(){const templates=(await listTemplates()).sort((a,b)=>b.updatedAt-a.updatedAt),select=$("#templateSelect");select.innerHTML='<option value="">选择已保存模板</option>'+templates.map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("");if(activeTemplate)select.value=activeTemplate.id;setStatus(templates.length?`本机已保存 ${templates.length} 个模板，无需重复上传`:"模板仅保存在当前浏览器")}
async function createTemplate(file){if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf"))return;activeTemplate={id:crypto.randomUUID(),name:file.name.replace(/\.pdf$/i,""),filename:file.name,file:new Blob([await file.arrayBuffer()],{type:"application/pdf"}),edits:[],createdAt:Date.now(),updatedAt:Date.now()};await putTemplate(activeTemplate);await refreshTemplateSelect();setStatus(`模板「${activeTemplate.name}」已保存到本机浏览器`)}
async function loadTemplate(id){const record=await getTemplate(id);if(!record)return;activeTemplate=record;currentFileName=safeName(record.name+"-岗位版");setStatus(`正在打开模板「${record.name}」…`);await importPdf(new File([record.file],record.filename,{type:"application/pdf"}));for(const edit of record.edits||[]){const block=pageRecords.flatMap(page=>page.blocks).find(item=>item.id===edit.id);if(!block)continue;Object.assign(block,edit,{modified:edit.text!==block.original});renderBlock(block)}applyPrivacy();$("#templateSelect").value=id;setStatus(`已打开模板「${record.name}」，修改会自动保存`)}
function currentEdits(){return pageRecords.flatMap(page=>page.blocks).filter(block=>block.modified).map(({id,text,fontSize,width,color})=>({id,text,fontSize,width,color}))}
function scheduleTemplateSave(){clearTimeout(templateSaveTimer);templateSaveTimer=setTimeout(saveTemplateEdits,400)}
async function saveTemplateEdits(){if(!activeTemplate)return;activeTemplate.edits=currentEdits();activeTemplate.updatedAt=Date.now();await putTemplate(activeTemplate);setStatus(`修改已自动保存到模板「${activeTemplate.name}」`)}
async function resetTemplateEdits(){if(!pageRecords.length)return setStatus("请先选择模板",true);if(!confirm("恢复原始模板并清除当前文字修改？"))return;for(const block of pageRecords.flatMap(page=>page.blocks)){block.text=block.original;block.width=block.baseWidth;block.fontSize=block.baseFontSize;block.color="#172f29";block.modified=false;renderBlock(block)}selectedBlock=null;$("#blockForm").hidden=true;$("#blockEmpty").hidden=false;await saveTemplateEdits();setStatus("已恢复原始模板")}
async function deleteActiveTemplate(){if(!activeTemplate)return setStatus("请先选择模板",true);if(!confirm(`从这台电脑删除模板「${activeTemplate.name}」？原 PDF 文件不会被删除。`))return;await removeTemplate(activeTemplate.id);activeTemplate=null;pageRecords=[];$("#pdfPages").innerHTML='<div class="source-empty">请上传 PDF 创建自己的模板。</div>';await refreshTemplateSelect();setStatus("模板已从当前浏览器删除")}
function applyPrivacy(){const enabled=$("#privacyMode").checked,pattern=/(?:1[3-9]\d{9})|(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/;for(const block of pageRecords.flatMap(page=>page.blocks))block.element?.classList.toggle("privacy-sensitive",enabled&&pattern.test(block.original));for(const [index,record] of pageRecords.entries()){let mask=record.canvas.parentElement.querySelector(".privacy-photo-mask");if(index===0&&!mask){mask=document.createElement("div");mask.className="privacy-photo-mask";record.canvas.parentElement.append(mask)}if(mask)mask.hidden=!enabled}}
refreshTemplateSelect().catch(()=>setStatus("当前浏览器无法保存模板，请检查隐私模式设置",true));
