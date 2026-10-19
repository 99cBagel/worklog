import {evaluateCompletion,pending} from './analysis/evaluate.js';
export async function runPilotEvaluation(env){
 const key='Pilot-completion.jpg';
 if(!await env.LOG_DATA.head(key))return {mode:'open_pilot',persisted:false,evaluation:pending('missing_demo_photo','請先在 R2 放入已完成隱私處理的 Pilot-completion.jpg。',true)};
 return {mode:'open_pilot',persisted:false,evaluation:await evaluateCompletion(env,{photoKey:key,projectId:'ROOM-001'})};
}

import {loadImage} from './task.js';
import {MODEL} from './analysis/evaluate.js';
// Uses only the public teaching image; never reads submissions or writes records.
export async function checkPilotAI(env) {
  if (!env.AI?.run) return {ok:false,stage:'binding',code:'ai_binding_missing'};
  let stage='example_load';
  try {
    const image=await loadImage(env,'Example.jpg');
    stage='vision_call';
    // One-time model activation explicitly authorized by the account owner on 2026-10-19.
    await env.AI.run(MODEL,{prompt:'agree'});
    const out=await env.AI.run(MODEL,{prompt:'Describe this room in one sentence.',image:Array.from(image.bytes),max_tokens:60});
    return {ok:typeof out?.response==='string'&&!!out.response.trim(),stage,model:MODEL,response:typeof out?.response==='string'?out.response.slice(0,400):null};
  } catch(error) {
    const message=String(error?.message||'Unknown provider error').replace(/Bearer\s+\S+/gi,'[redacted]').replace(/[A-Za-z0-9_-]{48,}/g,'[redacted]').slice(0,800);
    return {ok:false,stage,model:MODEL,code:String(error?.code||error?.name||'provider_error').slice(0,80),message};
  }
}
