import {env} from '../lib/server/env';
try{env();}catch(error){console.error(error instanceof Error?error.message:'Omgevingsconfiguratie ongeldig.');process.exit(1);}
