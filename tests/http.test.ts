import {describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {limitedJson} from '../src/lib/http';

const origin='https://orbit.example';
function streamed(body:string,contentType?:string){
 const stream=new ReadableStream<Uint8Array>({start(controller){if(body)controller.enqueue(new TextEncoder().encode(body));controller.close();}});
 return new NextRequest(origin+'/api/example',{method:'POST',headers:contentType?{'Content-Type':contentType}:{},body:stream});
}
describe('bounded request JSON with explicit optional empty input',()=>{
 it('keeps missing and empty JSON bodies invalid by default for existing endpoints',async()=>{
  const missing=new NextRequest(origin+'/api/example',{method:'POST',headers:{'Content-Type':'application/json'}});
  await expect(limitedJson(missing)).rejects.toThrow('Missing body');
  await expect(limitedJson(streamed('','application/json'))).rejects.toThrow();
  await expect(limitedJson(streamed(''))).rejects.toThrow('Expected JSON');
 });
 it('allows only an opted-in empty request without requiring Content-Type',async()=>{
  await expect(limitedJson(streamed(''),32,true)).resolves.toEqual({});
  await expect(limitedJson(new NextRequest(origin+'/api/example',{method:'POST'}),32,true)).resolves.toEqual({});
  await expect(limitedJson(streamed('{"mode":"login"}','application/json'),32,true)).resolves.toEqual({mode:'login'});
 });
 it('still rejects malformed or non-JSON nonempty input when empty input is allowed',async()=>{
  await expect(limitedJson(streamed('{','application/json'),32,true)).rejects.toThrow();
  await expect(limitedJson(streamed('{}','text/plain'),32,true)).rejects.toThrow('Expected JSON');
 });
 it('checks streamed size and cancels oversized bodies even without a Content-Length',async()=>{
  let canceled=false;
  const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(17));},cancel(){canceled=true;}});
  const input=new NextRequest(origin+'/api/example',{method:'POST',body:stream});
  await expect(limitedJson(input,16,true)).rejects.toThrow('Request too large');expect(canceled).toBe(true);
 });
});
