import {evaluateCompletion,pending} from './analysis/evaluate.js';
export async function runPilotEvaluation(env){
 const key='Pilot-completion.jpg';
 if(!await env.LOG_DATA.head(key))return {mode:'open_pilot',persisted:false,evaluation:pending('missing_demo_photo','請先在 R2 放入已完成隱私處理的 Pilot-completion.jpg。',true)};
 return {mode:'open_pilot',persisted:false,evaluation:await evaluateCompletion(env,{photoKey:key,projectId:'ROOM-001'})};
}
