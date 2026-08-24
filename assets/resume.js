import * as pdfjs from "./vendor/pdfjs/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const lab = document.querySelector("#resumeLab");
const $ = (selector) => lab.querySelector(selector);
const privacyFromUrl = new URLSearchParams(location.search).get("privacy") === "1";
let currentFileName = "定制简历", pageRecords = [], selectedBlock = null, editing = false, activeTemplate = null;
const dbPromise = openDatabase();

$("#privacyMode").checked = privacyFromUrl;
document.querySelector("#openResumeLab").addEventListener("click", () => openLab());
window.addEventListener("open-resume-lab", ({ detail }) => openLab(detail));
$("#resumeFile").addEventListener("change", ({ target }) => target.files[0] && importFile(target.files[0], true));
$("#editToggle").addEventListener("click", toggleEditing);
$("#privacyMode").addEventListener("change", applyPrivacy);
$("#resetTemplateEdits").addEventListener("click", resetAllEdits);
$("#exportPdf").addEventListener("click", printResume);

function openLab(job) {
  $("#editorJobContext").textContent = job ? `正在为「${job.company} — ${job.role}」制作岗位版；原版式不会改变。` : "PDF 是唯一基准：不换模板、不改内容，只修改你选中的文字。";
  currentFileName = job ? safeName(`${job.company}-${job.role}-定制简历`) : (activeTemplate?.name || "定制简历");
  lab.showModal();
}

async function importFile(file, save) {
  if (!file.name.toLowerCase().endsWith(".pdf")) return setStatus("请选择 PDF 文件", true);
  setStatus(`正在本地读取 ${file.name}…`);
  try {
    const data = await file.arrayBuffer();
    activeTemplate = { id: "current", name: file.name.replace(/\.pdf$/i, ""), filename: file.name, file: new Blob([data], { type: "application/pdf" }), edits: [], updatedAt: Date.now() };
    currentFileName = safeName(activeTemplate.name + "-岗位版");
    await renderPdf(data);
    if (save) await saveTemplate();
    setStatus(`已读取 ${file.name}；文件和修改只保存在本机浏览器`);
  } catch (error) { setStatus(`读取失败：${error.message}`, true); }
}

async function renderPdf(data) {
  const document = await pdfjs.getDocument({ data }).promise;
  pageRecords = []; selectedBlock = null; editing = false;
  $("#pdfPages").innerHTML = "";
  for (let pageNo = 1; pageNo <= document.numPages; pageNo++) await renderPage(await document.getPage(pageNo), pageNo);
  $("#editToggle").disabled = false; $("#resetTemplateEdits").disabled = false; $("#exportPdf").disabled = false;
  $("#editToggle").textContent = "开启编辑"; $("#pageHint").textContent = `${document.numPages} 页 · 原页面尺寸与图像已保留`;
  applyPrivacy();
}

async function renderPage(page, pageNo) {
  const scale = 2, viewport = page.getViewport({ scale });
  const shell = document.createElement("article"); shell.className = "pdf-edit-page"; shell.dataset.page = pageNo;
  shell.style.setProperty("--page-ratio", viewport.height / viewport.width);
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const overlay = document.createElement("div"); overlay.className = "pdf-text-overlay";
  shell.append(canvas, overlay); $("#pdfPages").append(shell);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  const baseCanvas=document.createElement("canvas"); baseCanvas.width=canvas.width; baseCanvas.height=canvas.height; baseCanvas.getContext("2d").drawImage(canvas,0,0);
  const content = await page.getTextContent();
  const blocks = groupRuns(content.items, viewport, canvas, pageNo);
  const record = { pageNo, canvas, baseCanvas, overlay, blocks, width: viewport.width, height: viewport.height };
  pageRecords.push(record);
  for (const block of blocks) {
    const hit = document.createElement("div"); hit.className = "pdf-text-block"; hit.title = block.original; hit.setAttribute("role","textbox"); hit.setAttribute("aria-label",`编辑：${block.original}`); hit.tabIndex = -1;
    Object.assign(hit.style, { left:`${block.x / viewport.width * 100}%`, top:`${block.y / viewport.height * 100}%`, width:`${block.width / viewport.width * 100}%`, minHeight:`${block.height / viewport.height * 100}%`, fontSize:`${block.fontSize / viewport.width * 100}cqw`, fontFamily:`"${block.fontName}","Microsoft YaHei",sans-serif` });
    hit.addEventListener("focus", () => beginInlineEdit(block, hit)); hit.addEventListener("input", () => updateInlineEdit(block, hit)); hit.addEventListener("blur", () => finishInlineEdit(block, hit)); hit.addEventListener("keydown", (event) => handleInlineKey(event, block, hit)); block.element = hit; overlay.append(hit);
  }
}

function groupRuns(items, viewport, canvas, pageNo) {
  const fragments = items.filter((item) => item.str?.length).map((item) => {
    const tx = pdfjs.Util.transform(viewport.transform, item.transform), fontSize = Math.max(8, Math.hypot(tx[2], tx[3]));
    return { text:item.str, fontName:item.fontName, x:tx[4], y:tx[5]-fontSize, width:Math.max(item.width*viewport.scale, 1), height:fontSize*1.25, fontSize };
  }).sort((a,b) => a.y-b.y || a.x-b.x);
  const rows = [];
  for (const item of fragments) { let row = rows.find((entry) => Math.abs(entry.y-item.y) < Math.max(3,item.fontSize*.3)); if (!row) { row={ y:item.y, items:[] }; rows.push(row); } row.items.push(item); }
  const runs = [];
  rows.forEach((row,rowIndex) => {
    row.items.sort((a,b)=>a.x-b.x); let parts=[];
    const flush = () => {
      const visible=parts.filter(part=>part.text.trim()); if(!visible.length){parts=[];return;}
      const x=Math.min(...visible.map(i=>i.x)), y=Math.min(...visible.map(i=>i.y)), end=Math.max(...visible.map(i=>i.x+i.width));
      const height=Math.max(...visible.map(i=>i.height)), fontSize=Math.max(...visible.map(i=>i.fontSize)), fontName=visible[0].fontName;
      const original=parts.map(i=>i.text).join("").replace(/\s+/g," ").trim();
      runs.push({ id:`${pageNo}-${rowIndex}-${runs.length}`, pageNo, original, text:original, fontName, x, y, width:Math.max(end-x,24), height:Math.max(height,16), fontSize, background:sampleBackground(canvas,x,y,end-x,height), color:sampleInk(canvas,x,y,end-x,height), modified:false }); parts=[];
    };
    for(const item of row.items){const previous=parts.at(-1),gap=previous?item.x-(previous.x+previous.width):0;const split=previous&&(item.fontName!==previous.fontName||Math.abs(item.fontSize-previous.fontSize)>1||gap>Math.max(16,item.fontSize*1.8));if(split)flush();parts.push(item);} flush();
  });
  return runs;
}

function sampleBackground(canvas,x,y,w,h) { const ctx=canvas.getContext("2d"), points=[[x-3,y+h/2],[x+w+3,y+h/2],[x+w/2,y-3],[x+w/2,y+h+3]]; let rgb=[0,0,0],n=0; for(const [px,py] of points){if(px<0||py<0||px>=canvas.width||py>=canvas.height)continue;const d=ctx.getImageData(Math.floor(px),Math.floor(py),1,1).data;rgb=rgb.map((v,i)=>v+d[i]);n++;} return n?`rgb(${rgb.map(v=>Math.round(v/n)).join(",")})`:"white"; }
function sampleInk(canvas,x,y,w,h) { const d=canvas.getContext("2d").getImageData(Math.max(0,Math.floor(x)),Math.max(0,Math.floor(y)),Math.max(1,Math.min(canvas.width-x,Math.ceil(w))),Math.max(1,Math.min(canvas.height-y,Math.ceil(h)))).data; let rgb=[0,0,0],n=0; for(let i=0;i<d.length;i+=4){const lum=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];if(lum<145){rgb[0]+=d[i];rgb[1]+=d[i+1];rgb[2]+=d[i+2];n++;}} return n?`rgb(${rgb.map(v=>Math.round(v/n)).join(",")})`:"#172f29"; }

function toggleEditing() {
  editing=!editing; lab.classList.toggle("editing",editing); $("#editToggle").textContent=editing?"完成编辑":"开启编辑";
  $("#pageHint").textContent=editing?"直接点击原文字并输入；Enter 完成，Esc 恢复":"预览模式 · 页面不会被意外改动";
  for(const block of pageRecords.flatMap(page=>page.blocks)){block.element.contentEditable=editing?"plaintext-only":"false";block.element.tabIndex=editing?0:-1;}
  if(!editing) document.activeElement?.blur();
}
function beginInlineEdit(block, element) {
  if(!editing)return; selectedBlock=block; lab.querySelectorAll(".pdf-text-block.inline-active").forEach(el=>el.classList.remove("inline-active")); element.classList.add("inline-active");
  redrawPage(pageRecords[block.pageNo-1],block); element.textContent=block.text; paintInlineBlock(block,true);
}
function updateInlineEdit(block, element) {
  block.text=element.innerText.replace(/[\r\n]+/g," "); if(element.innerText!==block.text)element.innerText=block.text;
  block.modified=block.text!==block.original; paintInlineBlock(block,true); fitInlineText(block,element); scheduleInlineSave();
}
function finishInlineEdit(block, element) {
  block.text=element.innerText.replace(/[\r\n]+/g," ").trim(); block.modified=block.text!==block.original; element.classList.remove("inline-active","inline-overflow");
  renderBlock(block); if(selectedBlock===block)selectedBlock=null; saveEdits(); setStatus(block.modified?"修改已自动保存在这台电脑":"未改变原文字");
}
function handleInlineKey(event, block, element) { if(event.key==="Enter"){event.preventDefault();element.blur();} if(event.key==="Escape"){event.preventDefault();block.text=block.original;block.modified=false;element.textContent=block.original;element.blur();} }
function paintInlineBlock(block,active=false){const el=block.element;el.style.background=block.background;el.style.boxShadow=`0 0 0 2px ${block.background}`;el.style.color=block.color;if(active)el.classList.add("inline-active");}
function fitInlineText(block,element){const record=pageRecords[block.pageNo-1],ctx=record.canvas.getContext("2d");ctx.font=`${block.fontSize}px "${block.fontName}"`;const needed=Math.max(1,ctx.measureText(block.text).width),scale=Math.min(1,block.width/needed),fitted=Math.max(.76,scale);block.renderFontSize=block.fontSize*fitted;element.style.fontSize=`${block.renderFontSize/record.width*100}cqw`;element.classList.toggle("inline-overflow",scale<.76);}
let inlineSaveTimer; function scheduleInlineSave(){clearTimeout(inlineSaveTimer);inlineSaveTimer=setTimeout(saveEdits,350);}
function renderBlock(block){const el=block.element,record=pageRecords[block.pageNo-1];el.classList.toggle("modified",block.modified);el.textContent="";el.style.background="transparent";el.style.boxShadow="none";el.style.color="transparent";el.style.fontSize=`${block.fontSize/record.width*100}cqw`;if(block.modified)fitInlineText(block,el);redrawPage(record);}
function redrawPage(record,activeBlock=null){
  const ctx=record.canvas.getContext("2d");ctx.clearRect(0,0,record.canvas.width,record.canvas.height);ctx.drawImage(record.baseCanvas,0,0);
  for(const block of record.blocks){if(block===activeBlock){eraseOriginal(ctx,block);continue;}if(!block.modified)continue;eraseOriginal(ctx,block);ctx.fillStyle=block.color;ctx.font=`${block.renderFontSize||block.fontSize}px "${block.fontName}","Microsoft YaHei",sans-serif`;ctx.textBaseline="top";ctx.fillText(block.text,block.x,block.y);}
}
function eraseOriginal(ctx,block){ctx.fillStyle=block.background;ctx.fillRect(block.x-3,block.y-2,block.width+6,Math.max(block.height,block.fontSize*1.3)+4);}
async function resetAllEdits(){if(!pageRecords.length||!confirm("恢复原 PDF，清除全部文字修改？"))return;document.activeElement?.blur();for(const block of pageRecords.flatMap(p=>p.blocks)){block.text=block.original;block.modified=false;renderBlock(block);}selectedBlock=null;await saveEdits();setStatus("已恢复原稿");}
function applyPrivacy(){ const enabled=$("#privacyMode").checked, pattern=/(?:1[3-9]\d{9})|(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/; lab.classList.toggle("privacy-on",enabled); for(const block of pageRecords.flatMap(page=>page.blocks)) block.element?.classList.toggle("privacy-sensitive",enabled&&pattern.test(block.original)); for(const [index,record] of pageRecords.entries()){let mask=record.overlay.querySelector(".privacy-photo-mask");if(index===0&&!mask){mask=document.createElement("div");mask.className="privacy-photo-mask";record.overlay.append(mask);}if(mask)mask.hidden=!enabled;} }
function printResume(){ if(!pageRecords.length)return; document.activeElement?.blur(); const oldTitle=document.title; document.title=currentFileName; lab.classList.add("printing"); setTimeout(()=>{window.print(); setTimeout(()=>{document.title=oldTitle;lab.classList.remove("printing");},300);},50); }

async function saveTemplate(){ if(!activeTemplate)return; activeTemplate.updatedAt=Date.now(); activeTemplate.edits=currentEdits(); const db=await dbPromise; await requestResult(db.transaction("templates","readwrite").objectStore("templates").put(activeTemplate)); }
async function saveEdits(){ if(!activeTemplate)return; activeTemplate.edits=currentEdits(); await saveTemplate(); }
function currentEdits(){ return pageRecords.flatMap(p=>p.blocks).filter(b=>b.modified).map(({id,text})=>({id,text})); }
async function restoreTemplate(){ try{const db=await dbPromise,record=await requestResult(db.transaction("templates").objectStore("templates").get("current"));if(!record)return;activeTemplate=record;currentFileName=safeName(record.name+"-岗位版");await renderPdf(await record.file.arrayBuffer());for(const edit of record.edits||[]){const block=pageRecords.flatMap(p=>p.blocks).find(b=>b.id===edit.id);if(block){block.text=edit.text;block.modified=edit.text!==block.original;renderBlock(block);}}applyPrivacy();setStatus(`已恢复本机模板「${record.name}」`);}catch{setStatus("浏览器未允许保存本机模板；仍可正常临时编辑",true);} }
function openDatabase(){return new Promise((resolve,reject)=>{const req=indexedDB.open("ruixuan-faithful-resume",1);req.onupgradeneeded=()=>req.result.createObjectStore("templates",{keyPath:"id"});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function requestResult(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function setStatus(message,failed=false){$("#fileStatus").textContent=message;$("#fileStatus").classList.toggle("error",failed);}
function safeName(value){return value.replace(/[\\/:*?"<>|]/g,"-").slice(0,90);}

restoreTemplate();