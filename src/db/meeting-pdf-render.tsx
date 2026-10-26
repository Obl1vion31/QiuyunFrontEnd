/** 复用网页展示组件，服务端浏览器仅打印内联内容，无外网和登录会话。 */
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import WeeklyMeetingPresentation from '../components/WeeklyMeetingPresentation';
import weeklyCss from '../styles/meeting-weekly.css?raw';
import tokens from '../styles/business-tokens.css?raw';
import fontCss from '../../public/fonts/misans-5.0.0/MiSansVF.css?raw';
const fontFiles=import.meta.glob('../../public/fonts/misans-5.0.0/*.woff2',{eager:true,query:'?inline',import:'default'}) as Record<string,string>;
const fonts=fontCss.replace(/url\('([^']+)'\)/g,(_match,name)=>`url('${Object.entries(fontFiles).find(([path])=>path.endsWith('/'+name))?.[1]??''}')`);
export async function renderMeetingPdf(snapshot:any,versionNumber:number){
 const markup=renderToStaticMarkup(<><header className="meeting-print-heading"><h1>{snapshot.meeting?.name??'例会复盘'}</h1><p>{snapshot.meeting?.periodStart}—{snapshot.meeting?.periodEnd} · V{versionNumber} · 会后定稿{snapshot.displayInvalidated?' · 已回溯失效':''}</p></header><WeeklyMeetingPresentation snapshot={snapshot}/></>);
 const css=fonts+tokens+weeklyCss.replace(/@import[^;]+;/g,'');
 let browser;
 try{
  chromium.setGraphicsMode=false;
  browser=await puppeteer.launch({args:chromium.args,executablePath:process.env.MEETING_CHROMIUM_PATH||await chromium.executablePath(),headless:'shell'});
  const page=await browser.newPage();await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);page.on('request',req=>{if(req.url().startsWith('data:')||req.url()==='about:blank')void req.continue();else void req.abort();});
  await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>${css}</style><body>${markup}</body></html>`,{waitUntil:'load',timeout:30000});
  await page.evaluate(async()=>{await document.fonts.ready;});
  const bytes=await page.pdf({format:'A4',landscape:true,printBackground:true,preferCSSPageSize:true,waitForFonts:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:`<div style="font:9px sans-serif;color:#667080;width:100%;text-align:right;margin:0 10mm">V${versionNumber} · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,timeout:30000});
  return Buffer.from(bytes);
 }finally{await browser?.close();}
}
