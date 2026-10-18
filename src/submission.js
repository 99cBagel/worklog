import {evaluateCompletion} from './analysis/evaluate.js';
import {getTask, MAX_IMAGE_BYTES} from './task.js';
export function validateFields(args={}) {
  const project_id=args.project_id || 'ROOM-001';
  if (project_id!=='ROOM-001') throw Error('找不到案件工作標準。');
  const phone=typeof args.phone==='string'?args.phone.trim():'';
  if (!/^09\d{8}$/.test(phone)) throw Error('請填寫 09 開頭的 10 碼工作者電話。');
  const case_code=typeof args.case_code==='string'?args.case_code.trim():'';
  if (!/^[\p{L}\p{N}_-]{1,80}$/u.test(case_code)) throw Error('請填寫案件代碼（限文字、數字、底線或連字號，最多 80 字）。');
  return {project_id,phone,case_code};
}
export async function identify(env,args) {
  const fields=validateFields(args); await getTask(env,fields.project_id);
  return {status:'ready',mode:'open_pilot',identity_verified:false,next_action:'請選擇結案照片，完成局部高斯模糊及預覽確認。',form_path:'/form'};
}
export async function prepareUpload() {
  return {status:'ready',max_bytes:MAX_IMAGE_BYTES,content_types:['image/jpeg','image/png'],form_path:'/form',
    fields:[{name:'phone',label:'工作者電話',required:true},{name:'case_code',label:'案件代碼',required:true},{name:'photo',label:'合規結案照片',required:true}],
    requirements:['在裝置上以局部高斯模糊遮蓋臉部與個資。','預覽匯出照片，確認個資無法辨識。','確認同意後，只上傳處理後的照片。']};
}
export async function readEvaluation(env,args) {
  if (typeof args?.submission_id!=='string'||!/^[a-f0-9-]{36}$/.test(args.submission_id)) throw Error('請提供有效的報備收據。');
  const obj=await env.LOG_DATA.get(args.submission_id+'-log.json');
  if (!obj) throw Error('找不到這筆報備。');
  const record=await obj.json();
  return {submission_id:args.submission_id,status:record.completion.status,evaluation:record.completion.evaluation};
}
export async function submitAndEvaluate(env,args={}) {
  const fields=validateFields(args);
  if (args.consent!==true||args.privacy_processed!==true) throw Error('請先完成隱私處理、預覽確認並同意上傳。');
  const photo=args.photo_base64;
  if (typeof photo!=='string'||photo.length>4*Math.ceil(MAX_IMAGE_BYTES/3)||photo.length%4!==0||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(photo)) throw Error('照片資料無效。');
  let raw;try{raw=atob(photo);}catch{throw Error('照片資料無效。');}
  if (raw.length<100||raw.length>MAX_IMAGE_BYTES) throw Error('照片須為 4 MiB 以下的 JPEG 或 PNG。');
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  if (!jpeg&&!png) throw Error('僅接受 JPEG 或 PNG 照片。');
  const submission_id=crypto.randomUUID();
  const photoKey=submission_id+(jpeg?'.jpg':'.png');
  const logKey=submission_id+'-log.json';
  await env.LOG_DATA.put(photoKey,bytes,{httpMetadata:{contentType:jpeg?'image/jpeg':'image/png'}});
  const evaluation=await evaluateCompletion(env,{photoKey,projectId:fields.project_id});
  const record={schema_version:'0.3.0',submission_id,...fields,record:{created_at:new Date().toISOString()},completion:{status:evaluation.status,evaluation,consent_confirmed:true,privacy_processed_attested:true},photos:[photoKey]};
  await env.LOG_DATA.put(logKey,JSON.stringify(record,null,2),{httpMetadata:{contentType:'application/json'}});
  return {submission_id,status:evaluation.status,evaluation};
}
