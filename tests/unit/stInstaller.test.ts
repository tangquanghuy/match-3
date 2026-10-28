import {describe,it,expect} from 'vitest';
import {createStLoaderArtifacts} from '../../src/sillytavern/installer';

describe('Tavern installation artifacts',()=>{
 it('pins the actual deployment directory in the imported script',()=>{
  const {source,script}=createStLoaderArtifacts('https://example.org/gems/');
  expect(source).toContain('const MATCH3_BASE = "https://example.org/gems/"');
  expect(source).not.toContain('YOUR_MATCH3_HOST');
  expect(script.content).toBe(source);
  expect(script).toMatchObject({type:'script',enabled:true,button:{enabled:true,buttons:[{name:'三消存档',visible:true}]}});
  expect(source).toContain("window.addEventListener('pagehide', cleanup");
  expect(source).toContain('tavernWindow.match3Host = match3');
 });
 it('normalizes directory URLs and preserves a subpath',()=>{
  expect(createStLoaderArtifacts('http://127.0.0.1:8000/a').source).toContain('"http://127.0.0.1:8000/a/"');
 });
 it.each(['file:///tmp/','javascript:alert(1)','https://user:pass@example.org/','https://example.org/?token=x','https://example.org/#x'])('rejects a non-directory deployment address: %s',(value)=>{
  expect(()=>createStLoaderArtifacts(value)).toThrow();
 });
});
