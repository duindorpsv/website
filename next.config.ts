import type {NextConfig} from "next";
const config:NextConfig={output:"standalone",htmlLimitedBots:/.*/,poweredByHeader:false,serverExternalPackages:["sharp","postgres"],experimental:{cpus:2},async headers(){return [{source:"/(.*)",headers:[{key:"X-Content-Type-Options",value:"nosniff"},{key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},{key:"X-Frame-Options",value:"SAMEORIGIN"}]}]}};
export default config;
