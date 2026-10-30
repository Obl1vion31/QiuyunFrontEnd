import source from '../../public/fonts/misans-5.0.0/MiSansVF.css?raw';

const files = import.meta.glob('../../public/fonts/misans-5.0.0/*.{0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,50,54}.woff2', {eager: true, query: '?inline', import: 'default'}) as Record<string,string>;
const critical = Object.fromEntries(Object.entries(files).map(([path,uri]) => [path.split('/').at(-1),uri]));
const faces: Array<{source:string;unicodeRange:string;weight:string}> = [];
export const businessFontCss = source.replace(/@font-face\{([^}]+)\}/g, (rule,body) => {
  const name = /url\('([^']+)'\)/.exec(body)![1];
  if (!critical[name]) return rule.replace(`url('${name}')`, `url('/fonts/misans-5.0.0/${name}')`);
  faces.push({source: critical[name], unicodeRange: /unicode-range:([^;]+)/.exec(body)![1], weight: /font-weight:([^;]+)/.exec(body)![1]});
  return '';
});
// 二进制FontFace同步完成解码；正文解析前注册原字形，避免先出现系统字或空字。
export const businessFontScript = `/* MiSans 5.0.0; Xiaomi font license: /fonts/misans-5.0.0/LICENSE-MiSans.pdf */
for (const face of ${JSON.stringify(faces)}) {
  const bytes = Uint8Array.from(atob(face.source.split(',')[1]), char => char.charCodeAt(0));
  document.fonts.add(new FontFace('MiSans VF', bytes, {weight: face.weight, unicodeRange: face.unicodeRange}));
}`;
