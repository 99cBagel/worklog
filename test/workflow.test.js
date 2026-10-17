import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { identify, prepareUpload, submitAndEvaluate, readEvaluation } from '../src/submission.js';
function env() {
 const objects=new Map();
 return { LOG_DATA: { async put(k,v){objects.set(k,v)}, async get(k){const v=objects.get(k);return v===undefined?null:{async json(){return JSON.parse(v)}}} } };
}
test('open pilot completes registration, consent-gated upload and result retrieval without secret',async()=>{
 const e=env(); const id=await identify(e,{project_id:'ROOM-001'});
 const args={project_id:'ROOM-001',authorization:id.authorization};
 assert.equal(id.identity_verified,false);
 assert.equal((await prepareUpload(e,args)).status,'ready');
 const bytes=new Uint8Array(120);bytes.set([255,216,255]);
 const photo_base64=Buffer.from(bytes).toString('base64');
 await assert.rejects(submitAndEvaluate(e,{...args,photo_base64}),/consent/);
 const result=await submitAndEvaluate(e,{...args,photo_base64,consent:true,privacy_processed:true});
 assert.equal(result.status,'manual_review');
 assert.equal((await readEvaluation(e,args)).status,'manual_review');
 await assert.rejects(prepareUpload(e,{...args,project_id:'OTHER'}),/wrong task/);
 const second=await identify(e,{project_id:'ROOM-001'});
 assert.equal((await readEvaluation(e,{...args,authorization:second.authorization})).status,'awaiting_submission');
 await assert.rejects(prepareUpload(e,{...args,authorization:'bad'}),/Invalid session/);
});
test('MCP advertises working schemas and identifies successfully',async()=>{
 const e=env();
 async function rpc(method,params){const r=await worker.fetch(new Request('https://test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),e);return (await r.json()).result}
 const list=await rpc('tools/list');
 assert.ok(list.tools.find(t=>t.name==='log_submit_photo').inputSchema.required.includes('consent'));
 const result=await rpc('tools/call',{name:'log_identify',arguments:{project_id:'ROOM-001'}});
 assert.equal(result.isError,false);assert.equal(JSON.parse(result.content[0].text).status,'registered');
});
