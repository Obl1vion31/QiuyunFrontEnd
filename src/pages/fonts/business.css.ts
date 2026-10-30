import source from '../../../public/fonts/misans-5.0.0/MiSansVF.css?raw';

// 原字体切片原样嵌入共享静态样式，避免首屏再发起一轮字体请求。
const files = import.meta.glob('../../../public/fonts/misans-5.0.0/*.{0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,50,54}.woff2', {eager: true, query: '?inline', import: 'default'}) as Record<string,string>;
const critical = Object.fromEntries(Object.entries(files).map(([path,uri]) => [path.split('/').at(-1),uri]));
const css = source.replace(/url\('([^']+)'\)/g, (_match,name) => `url('${critical[name] ?? '/fonts/misans-5.0.0/'+name}')`).replaceAll('font-display:swap','font-display:block');
export const prerender = true;
export function GET() {
  return new Response(css, {headers: {'Content-Type': 'text/css; charset=utf-8'}});
}
