import {businessFontScript} from '../../styles/business-font-assets';
export const prerender = true;
export function GET() {
  return new Response(businessFontScript, {headers: {'Content-Type': 'text/javascript; charset=utf-8'}});
}
