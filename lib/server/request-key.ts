import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

// Enable only behind a proxy that overwrites X-Real-IP and blocks direct access.
export function requestKey(request:Request, subject='') {
  const address=process.env.TRUST_PROXY_IP==='true'?request.headers.get('x-real-ip')||'':'';
  const value=isIP(address)?address:`${subject.toLowerCase()}:${request.headers.get('user-agent')||'anonymous'}`;
  return createHash('sha256').update(value).digest('hex');
}
