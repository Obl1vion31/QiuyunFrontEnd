/** 仅隔离 Node 测试服务使用；让浏览器与服务端一起跨越上海午夜。 */
import {readFileSync} from 'node:fs';
if(process.env.NODE_ENV!=='test'||!process.env.FIXTURE_CLOCK_FILE)throw new Error('隔离时钟仅允许测试使用');
const NativeDate=globalThis.Date;
class FixtureDate extends NativeDate{
 constructor(...args){if(args.length)super(...args);else super(FixtureDate.now());}
 static now(){return NativeDate.parse(readFileSync(process.env.FIXTURE_CLOCK_FILE,'utf8').trim());}
}
globalThis.Date=FixtureDate;
