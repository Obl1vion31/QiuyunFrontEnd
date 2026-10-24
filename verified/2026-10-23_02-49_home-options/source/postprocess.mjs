import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),root=process.cwd(),batch=resolve(root,'verified/2026-10-23_02-49_home-options'),raw=resolve(root,'.tools/test-artifacts/home-options');
const reports=JSON.parse(await readFile(resolve(batch,'motion/report.json'),'utf8'));
for(const item of reports){
 const output=resolve(batch,'motion',`${item.variant}-scroll.mp4`);
 const input=isAbsolute(item.video)?item.video:resolve(batch,'motion',item.video);
 if(input!==output)await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',input,'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',output]);
 if(item.variant!=='reduced'){
  const frames=JSON.parse(await readFile(resolve(batch,'motion',`${item.variant}-frames.json`),'utf8').catch(()=>readFile(resolve(raw,`${item.variant}-recorded-frames.json`),'utf8')));
  const samples=[frames[0],...Array.from({length:6},(_,i)=>frames.find(f=>Number(f.progress)>=(i+1)/6)).filter(Boolean),frames.at(-1)];
  await writeFile(resolve(batch,'motion',`${item.variant}-keyframes.json`),JSON.stringify(samples,null,2));
  await rename(resolve(batch,'motion',`${item.variant}-frames.json`),resolve(raw,`${item.variant}-recorded-frames.json`)).catch(error=>{if(error.code!=='ENOENT')throw error;});
  for(const [state,time]of[['initial',1.2],['middle',2.8],['handoff',5.8]])await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(time),'-i',output,'-frames:v','1',resolve(batch,'motion',`${item.variant}-${state}.png`)]);
 }
 item.video=`${item.variant}-scroll.mp4`;
}
await writeFile(resolve(batch,'motion/report.json'),JSON.stringify(reports,null,2)+'\n');
// 此图仅拼接真实首屏与后两区，便于比较阅读布局；实际滚动距离由录像和 metrics 给出。
for(const v of['a','b','c'])for(const width of[1440,1280,1024])await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',resolve(batch,'screenshots',v,`hero-${width}.png`),'-i',resolve(batch,'screenshots',v,`lower-${width}.png`),'-filter_complex','vstack=inputs=2','-frames:v','1',resolve(batch,'screenshots',v,`reading-${width}.png`)]);
console.log('MP4、录像关键帧和阅读拼接图已生成。');
