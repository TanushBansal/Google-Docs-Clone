const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {createApp}=require('./app');

test('Google sessions, owner/editor/viewer permissions, revocation, sanitization and persistence', async t=>{
    const dir=mkdtempSync(path.join(tmpdir(),'docs-test-'));
    const databasePath=path.join(dir,'test.sqlite');
    const app=createApp({databasePath,verifyToken:async value=>{ if(value==='bad') throw Error('invalid'); return JSON.parse(value); }});
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    t.after(async()=>{await new Promise(resolve=>server.close(resolve)); app.locals.db.close(); rmSync(dir,{recursive:true,force:true});});
    function client(){
        let cookie='';
        return async (route,method='GET',body,origin='http://localhost:3000')=>{
            const res=await fetch(base+route,{method,headers:{cookie,origin,'X-Requested-With':'DocsApp','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
            if(res.headers.get('set-cookie')) cookie=res.headers.get('set-cookie').split(';')[0];
            return {status:res.status,data:await res.json()};
        };
    }
    async function login(id){const c=client(); const config=await c('/api/auth/config'); const r=await c('/api/auth/google','POST',{credential:JSON.stringify({sub:id,email:id+'@gmail.com',name:id,email_verified:true,nonce:config.data.nonce})}); assert.equal(r.status,200);return c;}
    const anonymous=client();
    assert.equal((await anonymous('/api/documents')).status,401);
    await anonymous('/api/auth/config');
    assert.equal((await anonymous('/api/auth/google','POST',{credential:'bad'})).status,401);
    assert.equal((await anonymous('/api/auth/google','POST',{credential:JSON.stringify({sub:'fake',email:'fake@gmail.com',email_verified:true,nonce:'wrong'})})).status,401);
    const owner=await login('owner'), viewer=await login('viewer'), editor=await login('editor'), outsider=await login('outsider');
    assert.equal((await owner('/api/documents','POST',{title:'bad',content:''},'https://evil.example')).status,403);
    const created=await owner('/api/documents','POST',{title:'Private',content:'<b>safe</b><img src=x onerror=alert(1)><script>alert(1)</script>'});
    assert.equal(created.status,201); assert.equal(created.data.role,'owner'); assert.equal(created.data.content,'<b>safe</b>');
    const url='/api/documents/'+created.data.id;
    assert.equal((await outsider(url)).status,404);
    assert.equal((await outsider('/api/documents')).data.length,0);
    for(const [email,role] of [['viewer@gmail.com','viewer'],['editor@gmail.com','editor']]) assert.equal((await owner(url+'/permissions','PUT',{email,role})).status,200);
    assert.equal((await viewer(url)).data.role,'viewer');
    assert.equal((await viewer(url,'PUT',{title:'attack',content:''})).status,403);
    assert.equal((await editor(url,'PUT',{title:'Edited',content:'hello'})).status,200);
    assert.equal((await editor(url,'DELETE')).status,403);
    assert.equal((await viewer(url+'/permissions')).status,403);
    assert.equal((await editor(url+'/permissions','PUT',{email:'outsider@gmail.com',role:'editor'})).status,403);
    assert.equal((await owner(url+'/permissions','PUT',{email:'viewer@gmail.com',role:'owner'})).status,400);
    await owner(url+'/permissions','DELETE',{email:'viewer@gmail.com'});
    assert.equal((await viewer(url)).status,404);
    assert.equal((await viewer('/api/documents')).data.length,0);
    // A separate application instance reads the same disk database.
    const reopened=createApp({databasePath});
    assert.equal(reopened.locals.db.prepare('SELECT title FROM documents WHERE id=?').get(created.data.id).title,'Edited');
    assert.equal(reopened.locals.db.prepare('SELECT role FROM permissions WHERE email=?').get('editor@gmail.com').role,'editor');
    reopened.locals.db.close();
    await editor('/api/auth/logout','POST',{});
    assert.equal((await editor(url)).status,401);
    assert.equal((await owner(url,'DELETE')).status,200);
    assert.equal((await owner(url)).status,404);
    assert.equal(app.locals.db.prepare('SELECT count(*) AS n FROM permissions').get().n,0);
});
