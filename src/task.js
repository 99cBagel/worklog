export const PROJECT = 'ROOM-001';
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export function encode(bytes) {
  let out = '';
  for (let i=0;i<bytes.length;i+=8192) out += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(out);
}
export async function getTask(env, projectId = PROJECT) {
  if (projectId !== PROJECT) throw Error('找不到案件工作標準。');
  const obj = await env.LOG_DATA.get('Example.json');
  if (!obj) throw Error('缺少工作標準 Example.json。');
  const task = await obj.json();
  if (task.project_id !== projectId || !Array.isArray(task.criteria) || !task.criteria.length ||
      task.criteria.some(c => !c.id || !c.requirement) || new Set(task.criteria.map(c=>c.id)).size !== task.criteria.length ||
      !Array.isArray(task.work_points) || task.work_points.length < 3 || task.work_points.length > 5) throw Error('工作標準格式不完整。');
  return task;
}
export async function loadImage(env, key, maxBytes = MAX_IMAGE_BYTES) {
  const obj = await env.LOG_DATA.get(key) || (key === 'Example.jpg' && env.NGO_DATA ? await env.NGO_DATA.get('IMG_1818.jpeg') : null);
  if (!obj) throw Object.assign(Error('缺少評估圖片。'), {code:key === 'Example.jpg' ? 'missing_example_image' : 'missing_submission_image'});
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (bytes.length > maxBytes || bytes.length < 100) throw Object.assign(Error('圖片大小不符。'),{code:'invalid_image'});
  const jpeg = bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const png = [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  if (!jpeg && !png) throw Object.assign(Error('圖片格式不符。'),{code:'invalid_image'});
  return {bytes, mimeType:jpeg ? 'image/jpeg' : 'image/png'};
}
