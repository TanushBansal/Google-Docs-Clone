const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
test('switching flushes autosave; viewers cannot edit, share, or delete',async()=>{
    const elements=new Map(), timers=new Map(), requests=[];
    const make=()=>({value:'',innerHTML:'',innerText:'',textContent:'',style:{},classList:{add(){},toggle(){}},children:[],addEventListener(){},appendChild(child){this.children.push(child);},setAttribute(){},contains(){return false;}});
    const docs=[{id:'a',title:'A',content:'old',role:'owner'},{id:'b',title:'B',content:'read only',role:'viewer'}];
    const controls=[make(),make()];
    let timer=0;
    const context=vm.createContext({console,URLSearchParams,location:{search:''},history:{replaceState(){}},startAuthentication(){},
        window:{addEventListener(){}},localStorage:{getItem(){},setItem(){}},
        document:{getElementById(id){if(!elements.has(id))elements.set(id,make()); return elements.get(id);},querySelectorAll(selector){return selector.startsWith('.toolbar')?controls:[];},addEventListener(){},createElement:make},
        setTimeout(fn){timers.set(++timer,fn);return timer;},clearTimeout(id){timers.delete(id);},
        fetch:async(url,options)=>{requests.push({url,options});const id=url.split('/').pop();return {ok:true,json:async()=>url==='/api/documents'?docs:docs.find(d=>d.id===id)};}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/script.js'),'utf8'),context);
    vm.runInContext(`documents=${JSON.stringify(docs)};`,context);
    await vm.runInContext("openDocument('a')",context);
    vm.runInContext("editor.innerHTML='latest';markAsEdited()",context);
    await vm.runInContext("openDocument('b')",context);
    const saves=requests.filter(r=>r.options.method==='PUT');
    assert.equal(saves.length,1); assert.equal(JSON.parse(saves[0].options.body).content,'latest');
    assert.equal(elements.get('editor').contentEditable,'false');
    assert.equal(elements.get('document-title').disabled,true);
    assert.equal(elements.get('share-btn').disabled,true);
    assert.ok(controls.every(c=>c.disabled));
    vm.runInContext('markAsEdited()',context); assert.equal(timers.size,0);
    const rows=elements.get('document-list').children;
    assert.equal(rows.at(-1).children.length,2);
});
