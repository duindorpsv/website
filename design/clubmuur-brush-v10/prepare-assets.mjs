import {createRequire} from 'node:module';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const sharp=createRequire(wranglerRequire.resolve('miniflare/package.json'))('sharp');
const here=dirname(fileURLToPath(import.meta.url));
const output=resolve(here,'../../public/assets/clubmuur-brush-v10');
const input=process.argv[2];
if(!input)throw new Error('Provide the directory containing the seven native PNGs.');
const heroesOnly=process.argv.includes('--heroes');
const extrasOnly=process.argv.includes('--extras');
const specs=[
 {file:'01-hero-houtrust.png',id:'houtrust',type:'hero',left:300},
 {file:'02-hero-meeuwenhof.png',id:'de-wijk',type:'hero',left:140},
 {file:'03-hero-havenhoofd.png',id:'aan-zee',type:'hero',left:0},
 {file:'04-section-wijkpanorama.png',id:'section-wijkpanorama',type:'section'},
 {file:'05-section-houtrust.png',id:'section-houtrust',type:'section'},
 {file:'06-reserve-kerk.png',id:'reserve-kerk',type:'reserve'},
 {file:'07-reserve-meeuwenhof.png',id:'reserve-meeuwenhof',type:'reserve'},
];
await mkdir(output,{recursive:true});
await mkdir(resolve(here,'masters'),{recursive:true});
const manifest=[];
for(const spec of specs.filter(s=>(!heroesOnly||s.type==='hero')&&(!extrasOnly||s.type!=='hero'))){
 const source=resolve(input,spec.file);
 const metadata=await sharp(source).metadata();
 await copyFile(source,resolve(here,'masters',spec.file));
 const files=[];
 const shapes=spec.type==='hero'?['wide','portrait']:spec.type==='section'?['section']:[];
 for(const shape of shapes){
  const widths=shape==='wide'?[960,1280,1672]:shape==='portrait'?[480,800]:[800,1600];
  for(const width of widths){
   for(const format of ['avif','webp']){
    let pipeline=sharp(source);
    if(shape==='portrait')pipeline=pipeline.extract({left:spec.left,top:0,width:1000,height:metadata.height});
    pipeline=pipeline.resize({width,withoutEnlargement:true});
    pipeline=format==='avif'?pipeline.avif({quality:55,effort:4,chromaSubsampling:'4:4:4'}):pipeline.webp({quality:82,effort:5});
    const name=shape==='section'?`${spec.id}-${width}.${format}`:`${spec.id}-${shape}-${width}.${format}`;
    const info=await pipeline.toFile(resolve(output,name));
    if(info.width!==width)throw new Error(`Unexpected output width: ${name} = ${info.width}`);
    files.push({name,width:info.width,height:info.height,bytes:info.size});
   }
  }
 }
 manifest.push({...spec,native:{width:metadata.width,height:metadata.height},files});
 console.log(spec.file,`${metadata.width}x${metadata.height}`,files.map(f=>`${f.name}:${Math.round(f.bytes/1024)}KiB`).join(' '));
}
const combined=extrasOnly?[...JSON.parse(await readFile(resolve(here,'heroes-manifest.json'),'utf8')),...manifest]:manifest;
await writeFile(resolve(here,heroesOnly?'heroes-manifest.json':'manifest.json'),JSON.stringify(combined,null,2)+'\n');
if(!heroesOnly)await copyFile(resolve(input,'prompts.json'),resolve(here,'prompts.json'));
