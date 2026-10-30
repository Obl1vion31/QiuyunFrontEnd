import {businessFontCss} from '../../styles/business-font-assets';
export const prerender = true;
export function GET() {
  return new Response(businessFontCss, {headers: {'Content-Type': 'text/css; charset=utf-8'}});
}
