import {ZodError} from 'zod';
export class CmsError extends Error{constructor(public code:string,message:string,public status=400,public details:unknown=undefined){super(message);}}
export function errorResponse(error:unknown,requestId=crypto.randomUUID()){
 if(error instanceof ZodError)error=new CmsError('validation','Controleer de ingevulde velden.',422,error.issues.map(i=>({path:i.path.join('.'),message:i.message})));
 const problem=error instanceof CmsError?error:null;
 const known=!!problem;
 if(!known)console.error(JSON.stringify({requestId,code:'internal-error'}));
 return Response.json({code:known?problem!.code:'internal-error',message:known?problem!.message:'De actie is mislukt. Probeer opnieuw of geef het verzoeknummer door.',details:known?problem!.details:undefined,requestId},{status:known?problem!.status:500,headers:{'Cache-Control':'no-store'}});
}
export async function bodyJson(request:Request,max=2_000_000):Promise<unknown>{
 if(Number(request.headers.get('content-length')||0)>max)throw new CmsError('too-large','Het verzoek is te groot.',413);
 const reader=request.body?.getReader();if(!reader)throw new CmsError('invalid-json','Verzoekinhoud ontbreekt.');let bytes=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max){await reader.cancel();throw new CmsError('too-large','Het verzoek is te groot.',413);}chunks.push(value);}
 const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(all));}catch{throw new CmsError('invalid-json','Ongeldige JSON.');}
}
export async function bodyBytes(request:Request,max:number){const reader=request.body?.getReader();if(!reader)throw new CmsError('body','Verzoekinhoud ontbreekt.');let count=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>max){await reader.cancel();throw new CmsError('too-large','Dit verzoek is te groot.',413);}chunks.push(value);}const result=new Uint8Array(count);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.byteLength;}return result;}
