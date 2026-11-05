import {test} from 'node:test';import assert from 'node:assert/strict';
import {remapBrowserMediaReferences} from '../../lib/server/browser-media-import';
import {createCmsSeed} from '../../lib/cms/seed';import {createDefaultHeroSlider} from '../../lib/cms/hero-slider';
test('browser restore remaps slider media identities without touching builtins or Sportlink source identities',()=>{
 const state=createCmsSeed();const original='old-browser-image',mapped='stored-image';
 state.appearance={heroSlider:{...createDefaultHeroSlider(),slides:[{id:'media-slide',source:'media',sourceId:original,label:'Clubfoto',enabled:true,focusX:50,focusY:50},{id:'builtin-slide',source:'builtin',sourceId:original,label:'Vast',enabled:false,focusX:50,focusY:50}]}};
 state.planning.activities=[{id:'activity',source:'sportlink',sourceId:original} as any];
 const next=remapBrowserMediaReferences(state,{[original]:mapped});assert.equal(next.appearance!.heroSlider!.slides[0].sourceId,mapped);assert.equal(next.appearance!.heroSlider!.slides[1].sourceId,original);assert.equal(next.planning.activities[0].sourceId,original);assert.equal(state.appearance.heroSlider!.slides[0].sourceId,original);
});
