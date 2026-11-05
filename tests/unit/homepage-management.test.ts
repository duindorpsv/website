import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agendaDate,agendaSchema,upcomingAgenda} from '../../lib/club-agenda';
import {communityEventCalendar} from '../../lib/clubmuur-community';
import {defaultHeroPhotoIds,heroLayouts,heroPhotos,photosForLayout,pickHeroLayout,pickHeroPhoto,resolveHeroPhoto,validHeroPhotoIds} from '../../lib/clubmuur-layouts';

const event={id:'clubavond',title:'Clubavond',date:'2026-10-30',time:'19:30',description:'Welkom bij de club.'};
test('hero selection excludes disabled photos and incompatible saved layouts for every nonempty selection',()=>{
  assert.ok(validHeroPhotoIds(defaultHeroPhotoIds));
  assert.equal(validHeroPhotoIds([]),false);assert.equal(validHeroPhotoIds(['01-trots','01-trots']),false);assert.equal(validHeroPhotoIds(['unknown']),false);
  for(const photo of heroPhotos)for(const saved of heroLayouts)for(const random of [0,0.5,0.999]){
    const enabled=[photo.id],layout=pickHeroLayout(saved.id,random,enabled);
    assert.ok(photosForLayout(layout,enabled).length);
    assert.equal(pickHeroPhoto(layout,'disabled',random,enabled),photo.id);
    assert.equal(resolveHeroPhoto('disabled',layout,enabled),undefined);
  }
});
test('agenda validates real dates, required fields, unique IDs and missing summer hour',()=>{
  assert.ok(agendaSchema.safeParse([event]).success);
  for(const patch of [{title:''},{description:''},{date:'2026-02-30'},{date:'2026-10-32'},{time:'25:00'},{time:''},{date:'2027-03-28',time:'02:30'},{injected:'x'}])assert.equal(agendaSchema.safeParse([{...event,...patch}]).success,false,JSON.stringify(patch));
  assert.equal(agendaSchema.safeParse([event,event]).success,false);
  assert.ok(agendaSchema.safeParse([{...event,date:'2026-10-25',time:'02:30'}]).success);
});
test('agenda sorts by date/time and keeps today in the Dutch timezone until midnight',()=>{
  const earlier={...event,id:'earlier',time:'12:00'},next={...event,id:'next',date:'2026-11-01'},past={...event,id:'past',date:'2026-10-29'};
  assert.deepEqual(upcomingAgenda([next,event,past,earlier],Date.parse('2026-10-30T22:59:59Z')).map(item=>item.id),['earlier','clubavond','next']);
  assert.deepEqual(upcomingAgenda([next,event],Date.parse('2026-10-30T23:00:00Z')).map(item=>item.id),['next']);
  assert.equal(agendaDate(next),'1 november 2026');
});
test('calendar uses actual Amsterdam winter/summer time and safely folds/escapes user text',()=>{
  const winter=communityEventCalendar({...event,title:'Club; avond, samen',description:'é'.repeat(100)+'\r\nHallo\rBEGIN:INJECTED'});
  assert.ok(winter.includes('DTSTART:20261030T183000Z'));
  assert.ok(winter.includes('SUMMARY:Club\\; avond\\, samen'));
  assert.ok(!winter.includes('\r\nBEGIN:INJECTED'));
  assert.ok(winter.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
  assert.ok(communityEventCalendar({...event,date:'2026-07-30'}).includes('DTSTART:20260730T173000Z'));
});
