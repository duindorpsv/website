import type {NextConfig} from "next";
const config:NextConfig={output:"standalone",htmlLimitedBots:/.*/,poweredByHeader:false,serverExternalPackages:["sharp","postgres"],experimental:{cpus:2},async headers(){return [{source:"/(.*)",headers:[{key:"X-Content-Type-Options",value:"nosniff"},{key:"Referrer-Policy",value:"same-origin"},{key:"X-Frame-Options",value:"SAMEORIGIN"}]},{source:"/beheer/herstel",headers:[{key:"Referrer-Policy",value:"no-referrer"},{key:"Cache-Control",value:"private, no-store"}]}]}};
export default config;
