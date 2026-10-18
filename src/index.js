import {formPage} from './form.js';
import {identify,prepareUpload,readEvaluation,submitAndEvaluate} from './submission.js';
import {getTask,loadImage,encode} from './task.js';
import {runPilotEvaluation} from './pilot.js';
const VERSION='0.3.0';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type, mcp-protocol-version, mcp-session-id','x-content-type-options':'nosniff'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const result=(value,isError=false)=>({content:[{type:'text',text:JSON.stringify(value)}],isError});
const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const fields={project_id:{type:'string',enum:['ROOM-001'],default:'ROOM-001'},phone:{type:'string',pattern:'^09[0-9]{8}$'},case_code:{type:'string',minLength:1,maxLength:80}};
const tools=[
 {name:'log_get_task',description:'流程 1：展示專案自有示範圖片及 3–5 個工作重點。必須將回傳圖片展示給使用者；圖片是教學素材，並非合格成果。',inputSchema:schema({project_id:fields.project_id})},
 {name:'log_privacy_guide',description:'說明上傳前的局部高斯模糊、預覽確認與同意流程。',inputSchema:schema()},
 {name:'log_identify',description:'檢查工作者電話及案件代碼。Pilot 自行填報，不驗證身分。',inputSchema:schema(fields,['phone','case_code'])},
 {name:'log_prepare_upload',description:'流程 2：取得必填欄位與照片處理表單。',inputSchema:schema()},
 {name:'log_submit_photo',description:'提交工作者電話、案件代碼及經預覽確認的合規照片，保存並呼叫 Workers AI 評估。',inputSchema:schema({...fields,photo_base64:{type:'string',maxLength:5592408},consent:{const:true},privacy_processed:{const:true}},['phone','case_code','photo_base64','consent','privacy_processed'])},
 {name:'log_evaluate',description:'以報備收據取得已保存的評估結論，不重新上傳。',inputSchema:schema({submission_id:{type:'string',format:'uuid'}},['submission_id'])}
];
const INSTRUCTIONS='使用繁體中文簡短引導。流程 1 先呼叫 log_get_task，展示回傳的示範圖片及 3–5 個 work_points；若圖片不可用，明確告知，不得假稱已展示。圖片為專案自有授權教材，可能呈現待改善情境。流程 2 以欄位收集工作者電話、案件代碼、合規結案照片；可引導使用者開啟回傳的完整 form_url。只上傳裝置上局部高斯模糊、預覽確認及同意後的照片。原圖不得傳到遠端做遮蔽。結論僅 pass、no pass、pending further review；回覆結論、原因及下一步。技術失敗必須明確說明，不能宣稱完成評估。勿展示內部 JSON 或工具名稱；不假稱選項可點擊。';
async function taskResult(env,args,origin,includeImage=true) {
 const task=await getTask(env,args.project_id);
 let image;try{image=await loadImage(env,'Example.jpg');}catch{}
 const content=[{type:'text',text:JSON.stringify({project_id:task.project_id,title:task.title,work_points:task.work_points,criteria:task.criteria,image_available:!!image,image_url:image?origin+'/example.jpg':null,form_url:origin+'/form',message:image?'請展示示範圖片與以下工作重點。':'示範圖片尚未就緒；請管理者補上 Example.jpg。'})}];
 if(image&&includeImage)content.push({type:'image',data:encode(image.bytes),mimeType:image.mimeType});
 return {content,isError:false};
}
async function callTool(name,args,env,origin) {
 if(name==='log_get_task')return taskResult(env,args,origin);
 if(name==='log_privacy_guide')return result({...await prepareUpload(),form_url:origin+'/form',steps:['在裝置上框選臉部、姓名、電話、證件、地址及文件等個資，套用局部高斯模糊。','放大預覽；若仍可辨識，擴大範圍或加強模糊。','確認個資無法辨識並同意後，再上傳處理後的照片。']});
 const handlers={log_identify:identify,log_prepare_upload:prepareUpload,log_submit_photo:submitAndEvaluate,log_evaluate:readEvaluation};
 const value=await handlers[name](env,args);
 return result({...value,...(value.form_path?{form_url:origin+value.form_path}:{})});
}
async function readBody(request) {
 const limit=5_700_000;
 if(Number(request.headers.get('content-length')||0)>limit)throw Object.assign(Error('照片資料過大。'),{status:413});
 const reader=request.body?.getReader();if(!reader)throw Error('缺少請求內容。');
 let total=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw Object.assign(Error('照片資料過大。'),{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(total);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('JSON 格式錯誤。');}
}
export default {async fetch(request,env){
 const url=new URL(request.url),origin=url.origin;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if((url.pathname==='/'||url.pathname==='/form')&&request.method==='GET')return new Response(formPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
 if(url.pathname==='/health'&&request.method==='GET')return json({ok:true,service:'worklog-mcp',version:VERSION,mode:'open_pilot',upload_enabled:true,ai_binding_ready:!!env.AI?.run});
 if(url.pathname==='/task'&&request.method==='GET'){
  try{return json(JSON.parse((await taskResult(env,{project_id:url.searchParams.get('project_id')||undefined},origin,false)).content[0].text));}catch{return json({error:'工作標準尚未就緒。'},503);}
 }
 if(url.pathname==='/example.jpg'&&request.method==='GET'){
  try{const image=await loadImage(env,'Example.jpg');return new Response(image.bytes,{headers:{'content-type':image.mimeType,'cache-control':'no-cache','x-content-type-options':'nosniff'}});}catch{return json({error:'示範圖片尚未就緒。'},404);}
 }
 if(url.pathname==='/pilot/evaluate'&&request.method==='POST'){
  try{return json(await runPilotEvaluation(env));}catch{return json({status:'pending further review',error:'示範評估未完成。'},503);}
 }
 if(url.pathname==='/submit'&&request.method==='POST'){
  let body;try{body=await readBody(request);}catch(e){return json({error:e.message},e.status||400);}
  try{return json(await submitAndEvaluate(env,body));}catch{return json({error:'送出未完成，請檢查必填欄位與照片，或稍後重試。'},400);}
 }
 if(url.pathname!=='/mcp')return json({error:'Not found'},404);
 if(request.method!=='POST')return new Response('Use MCP Streamable HTTP POST.',{status:405,headers:{...HEADERS,allow:'POST, OPTIONS'}});
 let body;try{body=await readBody(request);}catch(e){return json({error:e.message},e.status||400);}
 if(!body||Array.isArray(body)||body.jsonrpc!=='2.0'||typeof body.method!=='string')return json({jsonrpc:'2.0',id:body?.id??null,error:{code:-32600,message:'Invalid request'}},400);
 if(body.id===undefined)return new Response(null,{status:202,headers:HEADERS});
 const ok=value=>json({jsonrpc:'2.0',id:body.id,result:value});
 const err=(code,message)=>json({jsonrpc:'2.0',id:body.id,error:{code,message}});
 switch(body.method){
  case 'initialize':return ok({protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},instructions:INSTRUCTIONS,serverInfo:{name:'worklog-mcp',version:VERSION}});
  case 'ping':return ok({});
  case 'tools/list':return ok({tools});
  case 'tools/call':{
   const name=body.params?.name;if(!tools.some(t=>t.name===name))return err(-32602,'Unknown tool');
   const args=body.params?.arguments||{};
   if(typeof args!=='object'||Array.isArray(args))return err(-32602,'Invalid arguments');
   try{return ok(await callTool(name,args,env,origin));}catch(e){return ok(result({status:'rejected',message: /電話|案件|隱私|照片|報備|工作標準|同意/.test(e.message)?e.message:'服務未完成，請稍後重試。'},true));}
  }
  default:return err(-32601,'Method not found');
 }
}};
