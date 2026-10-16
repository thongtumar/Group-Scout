// Unsaved form drafts stay in this browser tab; confirmed records use the main backup.
const memory=new Map(),PREFIX='groupscout-draft:',formBases=new WeakMap();
export const userToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function readDraft(key){if(memory.has(key))return memory.get(key);try{const raw=sessionStorage.getItem(PREFIX+key);if(raw){const value=JSON.parse(raw);memory.set(key,value);return value;}}catch{}return null;}
export function writeDraft(key,value){memory.set(key,value);try{sessionStorage.setItem(PREFIX+key,JSON.stringify(value));}catch{} }
export function clearDraft(key){memory.delete(key);try{sessionStorage.removeItem(PREFIX+key);}catch{} }
function formValues(form){const data={};for(const el of form.elements){if(!el.name||el.type==='button'||el.type==='submit')continue;data[el.name]=el.type==='checkbox'?el.checked:el.value;}return data;}
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fieldValue=value=>typeof value==='string'||typeof value==='boolean';

/** Merge edited draft fields against their original confirmed values. Any
 * conflict blocks the entire draft; unchanged fields keep the newest record. */
export function reconcileDraftValues(draft,current){
 const values={...current},conflicts=[];
 if(!object(draft?.values)||!object(draft?.base))return {ok:false,values,conflicts,legacy:true};
 const edits=[];
 for(const [name,value]of Object.entries(draft.values)){
  if(name==='id'||!Object.hasOwn(current,name))continue;
  if(!fieldValue(value)||!Object.hasOwn(draft.base,name)||!fieldValue(draft.base[name])){conflicts.push(name);continue;}
  if(value===draft.base[name])continue;
  if(current[name]!==draft.base[name]&&current[name]!==value)conflicts.push(name);
  else edits.push([name,value]);
 }
 if(conflicts.length)return {ok:false,values,conflicts,legacy:false};
 for(const [name,value]of edits)values[name]=value;
 return {ok:true,values,conflicts,legacy:false};
}

export function captureFormDraft(form){if(!form.dataset.draftKey)return;const values=formValues(form);writeDraft(form.dataset.draftKey,{values,base:formBases.get(form)||values});draftStatus(form,'Bản nháp được giữ trong tab này. Bấm Lưu để ghi nhận.');}
function showOldDraft(form){
 const old=readDraft(`${form.dataset.draftKey}:conflict`),content=document.getElementById('info-content'),dialog=document.getElementById('info-dialog');
 if(!old||!content||!dialog)return;
 document.getElementById('info-title').textContent='Bản nháp cũ chưa áp dụng';content.replaceChildren();
 const note=document.createElement('p');note.textContent='Bản nháp này được giữ để đối chiếu. Dữ liệu đã lưu chưa thay đổi; bạn có thể sao chép nội dung cần dùng rồi tự cập nhật.';content.append(note);
 const table=document.createElement('table'),head=document.createElement('thead'),header=document.createElement('tr');
 for(const label of ['Trường','Đã lưu hiện tại','Trong nháp cũ']){const th=document.createElement('th');th.textContent=label;header.append(th);}head.append(header);table.append(head);
 const body=document.createElement('tbody'),current=formBases.get(form)||formValues(form),base=object(old.base)?old.base:null;
 const display=value=>typeof value==='boolean'?(value?'Có':'Không'):String(value??'');
 for(const [name,value]of Object.entries(object(old.values)?old.values:{})){
  if(name==='id'||!Object.hasOwn(current,name)||(base&&Object.hasOwn(base,name)&&value===base[name]))continue;
  const row=document.createElement('tr');for(const text of [LABELS[name]||name,display(current[name]),display(value)]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}body.append(row);
 }
 table.append(body);content.append(table);dialog.showModal();
}
function refreshOldDraftButton(form){
 const target=document.getElementById(form.dataset.draftStatus),holder=target?.closest('.draft-status');if(!holder)return;
 const existing=holder.querySelector('[data-old-draft]'),old=readDraft(`${form.dataset.draftKey}:conflict`);
 if(!old){existing?.remove();return;}if(existing)return;
 const button=document.createElement('button');button.type='button';button.className='text-link';button.dataset.oldDraft='true';button.textContent='Xem nháp cũ';button.onclick=()=>showOldDraft(form);holder.append(button);
}
function draftStatus(form,text){const target=document.getElementById(form.dataset.draftStatus);if(target)target.textContent=text;refreshOldDraftButton(form);}
export function restoreFormDraft(form,key){
 form.dataset.draftKey=key;const current=formValues(form);formBases.set(form,current);const draft=readDraft(key);
 if(draft){const result=reconcileDraftValues(draft,current);if(!result.ok){writeDraft(`${key}:conflict`,draft);clearDraft(key);draftStatus(form,'Bản nháp cũ khác dữ liệu mới. Chưa áp dụng để tránh ghi đè.');return false;}
  for(const [name,value]of Object.entries(result.values)){const el=form.elements.namedItem(name);if(!el||name==='id')continue;if(el.type==='checkbox')el.checked=value===true;else if(typeof value==='string')el.value=value;}
  draftStatus(form,'Đã khôi phục bản nháp trên tab này.');return true;}
 draftStatus(form,readDraft(`${key}:conflict`)?'Bản nháp cũ khác dữ liệu mới. Chưa áp dụng để tránh ghi đè.':'Chưa có thay đổi chưa lưu.');return false;
}
export function clearFormDraft(form,{discardAll=false}={}){clearDraft(form.dataset.draftKey);if(discardAll)clearDraft(`${form.dataset.draftKey}:conflict`);formBases.set(form,formValues(form));draftStatus(form,'Đã lưu vào danh sách.');}
export function watchFormDraft(form,statusId){form.dataset.draftStatus=statusId;form.addEventListener('input',()=>captureFormDraft(form));form.addEventListener('change',()=>captureFormDraft(form));}
export function revealField(el){if(!el)return;for(let node=el.parentElement;node;node=node.parentElement){if(node.tagName==='DETAILS')node.open=true;if(node.hasAttribute('data-stage-date'))node.hidden=false;}}
const LABELS={name:'Tên nhóm',url:'Link nhóm',location:'Khu vực',category:'Chủ đề',anonymous:'Đăng ẩn danh',surveys:'Cho đăng khảo sát',saved:'Nhóm ưu tiên',notes:'Ghi chú nhóm',members:'Số thành viên',postsPerDay:'Bài đăng/ngày',responses:'Số mẫu hợp lệ',stage:'Giai đoạn',contactedAt:'Ngày xin phép',submittedAt:'Ngày gửi duyệt',postedAt:'Ngày đã đăng',lastReviewedAt:'Ngày kiểm tra gần nhất',nextActionAt:'Ngày hẹn',nextAction:'Việc cần làm',postUrl:'Link bài đăng',sourceCode:'Mã nguồn',surveyUrl:'Link Google Form',received:'Tổng đã nhận',rejected:'Số đã loại',minutesSpent:'Thời gian đã dành',verifiedAt:'Ngày xác minh',stopReason:'Ghi chú'};
export function showFormErrors(form,box,errors,activatePanel=()=>{}){box.textContent=errors.map(error=>String(error).replace(/\b([A-Za-z]+):/g,(all,key)=>LABELS[key]?LABELS[key]+':':all)).join('\n');for(const el of form.querySelectorAll('[aria-invalid]'))el.removeAttribute('aria-invalid');form.querySelectorAll('[data-inline-error]').forEach(el=>el.remove());const first=String(errors[0]||'');let field=Object.keys(LABELS).find(key=>first.startsWith(key+':')||first.startsWith(LABELS[key]+':'));if(!field&&/phản hồi|mẫu hợp lệ|mẫu loại|hợp lệ cộng/.test(first))field='received';const target=field?form.elements.namedItem(field):null;if(target){activatePanel(target.closest('[data-workflow-panel]')?.dataset.workflowPanel);revealField(target);target.setAttribute('aria-invalid','true');const hint=document.createElement('small');hint.dataset.inlineError='true';hint.className='field-error';hint.textContent=box.textContent;target.closest('label')?.append(hint);target.focus();}else{box.tabIndex=-1;box.focus();box.scrollIntoView({block:'nearest'});}}
export function checkFormValidity(form,activatePanel=()=>{}){const first=form.querySelector(':invalid');if(!first)return true;activatePanel(first.closest('[data-workflow-panel]')?.dataset.workflowPanel);revealField(first);first.reportValidity();return false;}
