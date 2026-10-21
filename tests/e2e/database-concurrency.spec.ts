import {test,expect} from '@playwright/test';

test('concurrent public pages and API routes share bounded database connections',async({request})=>{
  test.setTimeout(90000);
  const archive=await (await request.get('/api/archive')).json();
  const paths=['/clubmuur','/clubmuur/nieuws','/clubmuur/club/bestuur',
    '/clubmuur/club/tijdlijn/'+archive.moments[0].slug,
    '/clubmuur/club/museum/'+archive.objects[0].slug,
    '/api/archive','/api/site/config','/health/ready'];
  const responses=await Promise.all(paths.map(async path=>{
    const response=await request.get(path);
    expect(response.status(),path).toBe(200);
    expect((await response.body()).length,path).toBeGreaterThan(0);
    return response;
  }));
  for(const response of responses)await response.dispose();
});
