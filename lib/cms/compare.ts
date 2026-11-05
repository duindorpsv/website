// PostgreSQL JSONB and editors may return identical objects in different key order.
export function equalContent(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>equalContent(value,b[index]));
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
  const keys=Object.keys(left).filter(key=>left[key]!==undefined);
  return keys.length===Object.keys(right).filter(key=>right[key]!==undefined).length&&keys.every(key=>Object.hasOwn(right,key)&&equalContent(left[key],right[key]));
}
