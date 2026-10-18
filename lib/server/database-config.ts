export function databaseOptions(max:number){
  const ca=process.env.DATABASE_CA_CERT_B64;
  if(process.env.APP_ENV==='production'&&!ca)throw new Error('DATABASE_CA_CERT_B64 ontbreekt.');
  return {max,idle_timeout:20,connect_timeout:10,prepare:false,
    ...(ca?{ssl:{ca:Buffer.from(ca,'base64').toString('ascii'),rejectUnauthorized:true}}:{})};
}
