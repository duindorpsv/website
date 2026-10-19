import {test} from 'node:test';
import assert from 'node:assert/strict';
import {equalContent} from '../../lib/cms/compare';

test('JSONB key order cannot turn unchanged editor content into another autosave',()=>{
  const editor={type:'doc',content:[{type:'paragraph',attrs:{align:'left',level:1},content:[{type:'text',text:'Nieuws'}]}]};
  const stored={content:[{content:[{text:'Nieuws',type:'text'}],attrs:{level:1,align:'left'},type:'paragraph'}],type:'doc'};
  assert.equal(equalContent(editor,stored),true);
  assert.equal(equalContent({featured:false,featuredUntil:undefined},{featured:false}),true);
  assert.equal(equalContent(editor,{...stored,content:[]}),false);
  assert.equal(equalContent(['eerste','tweede'],['tweede','eerste']),false);
  assert.equal(equalContent({featured:false},{featured:true}),false);
});
