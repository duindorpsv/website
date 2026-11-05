import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareSponsorLogo} from '../../lib/server/sponsor-logos';

test('sponsor logos decode PNG, JPEG and WebP, cap dimensions and retain transparency',async()=>{
 const source=sharp({create:{width:1600,height:800,channels:4,background:{r:12,g:90,b:160,alpha:.3}}});
 for(const [format,mime] of [['png','image/png'],['jpeg','image/jpeg'],['webp','image/webp']] as const){
  const input=await source.clone().toFormat(format).toBuffer(),result=await prepareSponsorLogo(input,mime),metadata=await sharp(result).metadata();
  assert.equal(metadata.format,'webp');assert.equal(metadata.width,640);assert.equal(metadata.height,320);
  if(format!=='jpeg')assert.equal(metadata.hasAlpha,true);
 }
});

test('sponsor logos reject SVG/HTML, disguised content, broken pixels and the bounded original',async()=>{
 for(const content of ['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>','<html><script>alert(1)</script></html>'])await assert.rejects(prepareSponsorLogo(Buffer.from(content),'image/png'),(error:any)=>error.code==='upload-type');
 const png=await sharp({create:{width:1,height:1,channels:4,background:'transparent'}}).png().toBuffer();
 await assert.rejects(prepareSponsorLogo(png,'image/jpeg'),(error:any)=>error.code==='upload-type');
 await assert.rejects(prepareSponsorLogo(png.subarray(0,12),'image/png'),(error:any)=>error.code==='upload-image');
 await assert.rejects(prepareSponsorLogo(new Uint8Array(8*1024*1024+1),'image/png'),(error:any)=>error.status===413);
 await assert.rejects(prepareSponsorLogo(new Uint8Array(),'image/png'),(error:any)=>error.code==='upload-empty');
});
