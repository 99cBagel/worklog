import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/index.js';
import {identify,submitAndEvaluate,readEvaluation} from '../src/submission.js';
import {evaluateCompletion} from '../src/analysis/evaluate.js';
import {formPage} from '../src/form.js';
const example=readFileSync(new URL('./fixtures/demo.png',import.meta.url));
const task=JSON.parse(readFileSync(new URL('../Log-data/Example.json',import.meta.url)));
const args={phone:'0900000000',case_code:'測試-001',project_id:'ROOM-001',photo_base64:example.toString('base64'),consent:true,privacy_processed:true};
function env(statuses=['pass','pass']) {
 const objects=new Map([['Example.json',JSON.stringify(task)],['Example.jpg',example]]),calls=[];
 return {objects,calls,LOG_DATA:{async put(k,v){objects.set(k,v)},async get(k){const v=objects.get(k);if(v===undefined)return null;return {size:Buffer.byteLength(v),async json(){return JSON.parse(v)},async text(){return String(v)},async arrayBuffer(){return Uint8Array.from(v).buffer}}}},AI:{async run(model,input){calls.push(input);assert.equal(model,'@cf/meta/llama-3.2-11b-vision-instruct');assert.equal(typeof input.prompt,'string');assert.ok(Array.isArray(input.image));assert.equal(input.image[0],137);assert.ok(!input.messages);return {response:input.prompt.startsWith('Describe')?'Visible chair and curtain.':JSON.stringify({criteria:task.criteria.map((c,i)=>({id:c.id,status:statuses[i],evidence:'可見證據',reason:'依工作標準判斷'})),summary:'評估原因',next_action:'下一步'})};}}};
}
async function rpc(e,method,params){const response=await worker.fetch(new Request('https://test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),e);return (await response.json()).result;}
for(const [states,status] of [[['pass','pass'],'pass'],[['fail','pass'],'no pass'],[['uncertain','pass'],'pending further review'],[['fail','uncertain'],'no pass']])test('vision and persisted outcome: '+states,async()=>{
 const e=env(states),value=await submitAndEvaluate(e,args);assert.equal(value.status,status);assert.equal(e.calls.length,2);assert.ok(!('authorization' in value));
 const result=await readEvaluation(e,{submission_id:value.submission_id});assert.equal(result.status,status);assert.ok(!JSON.stringify(result).includes(args.phone));
 const record=JSON.parse(e.objects.get(value.submission_id+'-log.json'));assert.equal(record.case_code,args.case_code);assert.equal(record.phone,args.phone);
 const second=await submitAndEvaluate(e,args);assert.notEqual(value.submission_id,second.submission_id);assert.ok(e.objects.has(value.submission_id+'-log.json'));
});
test('fields and consent rejected before storage or AI',async()=>{
 for(const patch of [{phone:undefined},{case_code:''},{case_code:'../private'},{consent:false},{privacy_processed:false},{photo_base64:'AAAA'},{photo_base64:'!bad'},{project_id:'OTHER'}]){
 const e=env();await assert.rejects(submitAndEvaluate(e,{...args,...patch}));assert.equal(e.objects.size,2);assert.equal(e.calls.length,0);
 }
 const e=env();assert.equal((await identify(e,args)).status,'ready');assert.equal(e.objects.size,2);
});
test('missing example, missing binding, provider failures and invalid responses remain distinct',async()=>{
 const scenarios=[['missing_example_image',e=>e.objects.delete('Example.jpg')],['ai_binding_missing',e=>delete e.AI],['ai_service_error',e=>{e.AI.run=async()=>{throw Error('private provider detail')}}],['invalid_ai_json',e=>{e.AI.run=async()=>({response:'bad json'})}],['invalid_ai_checklist',e=>{e.AI.run=async()=>({response:'{}'})}]];
 for(const [code,setup]of scenarios){const e=env();setup(e);const r=await submitAndEvaluate(e,args);assert.equal(r.status,'pending further review');assert.equal(r.evaluation.reason_code,code);assert.equal(r.evaluation.technical_failure,true);assert.ok(!JSON.stringify(r).includes('private provider detail'));assert.ok(e.objects.has(r.submission_id+'-log.json'));}
});
test('missing or malformed task is an explicit evaluation failure',async()=>{
 const e=env();e.objects.delete('Example.json');e.objects.set('test.jpg',example);const r=await evaluateCompletion(e,{photoKey:'test.jpg'});assert.equal(r.reason_code,'task_configuration_error');assert.equal(r.technical_failure,true);
});
test('MCP returns actual owned image, four points and complete links',async()=>{
 const e=env(),r=await rpc(e,'tools/call',{name:'log_get_task',arguments:{}});assert.equal(r.isError,false);assert.equal(r.content[1].type,'image');assert.equal(r.content[1].data,example.toString('base64'));const d=JSON.parse(r.content[0].text);assert.equal(d.work_points.length,4);assert.equal(d.form_url,'https://test/form');
 const list=await rpc(e,'tools/list');const upload=list.tools.find(t=>t.name==='log_submit_photo').inputSchema;for(const field of ['phone','case_code','consent','privacy_processed'])assert.ok(upload.required.includes(field));assert.ok(!upload.properties.authorization);
 const image=await worker.fetch(new Request('https://test/example.jpg'),e);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),example);
 const privateResponse=await worker.fetch(new Request('https://test/private-log.json'),e);assert.equal(privateResponse.status,404);
});
test('missing demonstration is reported, never claimed as displayed',async()=>{
 const e=env();e.objects.delete('Example.jpg');const r=await rpc(e,'tools/call',{name:'log_get_task',arguments:{}});assert.equal(r.content.length,1);assert.equal(JSON.parse(r.content[0].text).image_available,false);
});
test('direct form upload works and request bodies are bounded without content-length',async()=>{
 const e=env(),r=await worker.fetch(new Request('https://test/submit',{method:'POST',body:JSON.stringify(args)}),e);assert.equal(r.status,200);assert.equal((await r.json()).status,'pass');
 const bad=await worker.fetch(new Request('https://test/mcp',{method:'POST',body:'x'.repeat(5_700_001)}),e);assert.equal(bad.status,413);
 const nullBody=await worker.fetch(new Request('https://test/mcp',{method:'POST',body:'null'}),e);assert.equal(nullBody.status,400);
});
test('browser script parses and local Gaussian blur mixes pixels without changing uniform colors',()=>{
 const script=formPage.match(/<script>([\s\S]*)<\/script>/)[1];new Function(script);
 const gaussian=script.slice(script.indexOf('function gaussian'),script.indexOf('function render'));
 const scope={Uint8ClampedArray,Math};vm.createContext(scope);vm.runInContext(gaussian,scope);
 const data=new Uint8ClampedArray(12*12*4).fill(80);scope.gaussian({width:12,height:12,data},12);assert.ok(data.every(v=>v===80));
 const mixed=new Uint8ClampedArray(12*12*4);mixed.fill(255,6*12*4);const prior=Buffer.from(mixed);scope.gaussian({width:12,height:12,data:mixed},12);assert.notDeepEqual(Buffer.from(mixed),prior);assert.ok(mixed[0]>0&&mixed[0]<255);
});

test('example can be read from existing NGO R2 without copying into WorkLog',async()=>{
 const e=env();e.objects.delete('Example.jpg');e.NGO_DATA={async get(key){assert.equal(key,'IMG_1818.jpeg');return {async arrayBuffer(){return Uint8Array.from(example).buffer}}}};
 const r=await rpc(e,'tools/call',{name:'log_get_task',arguments:{}});assert.equal(r.content[1].type,'image');assert.equal(JSON.parse(r.content[0].text).image_available,true);
 const result=await submitAndEvaluate(e,args);assert.equal(result.status,'pass');
});
