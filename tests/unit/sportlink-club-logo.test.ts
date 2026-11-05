import assert from 'node:assert/strict';
import test from 'node:test';
import {clubLogoUrl} from '../../lib/sportlink-club-logo';

test('club logos use the official KNVB source even for cached obsolete or temporary URLs',()=>{
 for(const logoUrl of ['https://logoapi.voetbal.nl/logo.php?clubcode=BBGV42S','https://binaries.sportlink.com/expired?sig=temporary',null]){
  const team={clubCode:' bbGV42s ',own:false,logoUrl};
  assert.equal(clubLogoUrl(team),'https://sassets.knvb.nl/sites/voetbal.nl/files/knvblogos_width60/BBGV42S.png');
 }
 assert.equal(clubLogoUrl({clubCode:'',own:true}),'/assets/logo.png');
 for(const clubCode of ['', ' ', '../BBGV42S','BBGV42S.png','https://example.invalid/logo','BBGV42S?redirect=elsewhere'])assert.equal(clubLogoUrl({clubCode,own:false}),null);
});
