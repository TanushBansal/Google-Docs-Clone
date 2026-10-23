const {test}=require('node:test');
const assert=require('node:assert/strict');
const mongoose=require('mongoose');
const {MongoMemoryServer}=require('mongodb-memory-server');
const {createApp}=require('./app');

test('Google sessions, owner/editor/viewer permissions, revocation, sanitization and persistence', async t=>{
    const mongo=await MongoMemoryServer.create();
    const connection=await mongoose.createConnection(mongo.getUri()).asPromise();
    t.after(async()=>{await connection.close();await mongo.stop();});
    const app=createApp({connection,verifyToken:async value=>{ if(value==='bad') throw Error('invalid'); return JSON.parse(value); }});
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    t.after(async()=>{await new Promise(resolve=>server.close(resolve));});
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
    assert.equal((await anonymous('/health')).data.status,'ok');
    assert.equal((await anonymous('/api/documents')).status,401);
    await anonymous('/api/auth/config');
    assert.equal((await anonymous('/api/auth/google','POST',{credential:'bad'})).status,401);
    assert.equal((await anonymous('/api/auth/google','POST',{credential:JSON.stringify({sub:'fake',email:'fake@gmail.com',email_verified:true,nonce:'wrong'})})).status,401);
    const owner=await login('owner'), viewer=await login('viewer'), editor=await login('editor'), outsider=await login('outsider');
    assert.equal((await owner('/api/documents','POST',{title:'bad',content:''},'https://evil.example')).status,403);
    const created=await owner('/api/documents','POST',{title:'Private',content:'<b>safe</b><img src=x onerror=alert(1)><script>alert(1)</script>'});
    assert.equal(created.status,201); assert.equal(created.data.role,'owner'); assert.equal(created.data.content,'<b>safe</b>');
    const url='/api/documents/'+created.data.id;
    assert.match(created.data.id,/^[a-f0-9]{24}$/);
    assert.equal((await owner('/api/documents/not-an-id')).status,400);
    assert.equal((await owner('/api/documents','POST',{title:42,content:''})).status,400);
    const legacy=await app.locals.models.Document.create({title:'Existing unowned document',content:'Keep me'});
    assert.equal((await owner('/api/documents/'+legacy.id)).status,404);
    assert.equal((await owner('/api/documents')).data.length,1);
    assert.equal((await app.locals.models.Document.findById(legacy.id)).content,'Keep me');
    await legacy.deleteOne();
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
    // A separate MongoDB connection reads persisted documents, sharing and sessions.
    const reopenedConnection=await mongoose.createConnection(mongo.getUri()).asPromise();
    try {
        const reopened=createApp({connection:reopenedConnection});
        const persisted=await reopened.locals.models.Document.findById(created.data.id);
        assert.equal(persisted.title,'Edited');
        assert.equal(persisted.permissions.find(p=>p.email==='editor@gmail.com').role,'editor');
        assert.equal(await reopened.locals.models.Session.countDocuments({user:'owner'}),1);
    } finally { await reopenedConnection.close(); }
    await editor('/api/auth/logout','POST',{});
    assert.equal((await editor(url)).status,401);
    assert.equal((await owner(url,'DELETE')).status,200);
    assert.equal((await owner(url)).status,404);
    assert.equal(await app.locals.models.Document.countDocuments(),0);
    await app.locals.models.Session.updateMany({user:'outsider'},{$set:{expires:new Date(0)}});
    assert.equal((await outsider('/api/documents')).status,401);
});
