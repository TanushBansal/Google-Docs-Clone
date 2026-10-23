const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const sanitize = require('sanitize-html');

function createApp({ databasePath = process.env.DATABASE_PATH || path.join(__dirname, 'data/docs.sqlite'), verifyToken } = {}) {
    if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
    const db = new DatabaseSync(databasePath);
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, content TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS permissions (document TEXT REFERENCES documents(id) ON DELETE CASCADE, email TEXT NOT NULL, role TEXT CHECK(role IN ('viewer','editor')) NOT NULL, PRIMARY KEY(document,email));
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user TEXT REFERENCES users(id), nonce TEXT NOT NULL, expires INTEGER NOT NULL);`);
    const app = express();
    const google = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const hash = value => createHash('sha256').update(value).digest('hex');
    const cookie = (res, token, age = 86400) => res.setHeader('Set-Cookie', `docs_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    app.disable('x-powered-by');
    app.use(express.json({ limit: '1mb' }));
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
        if (!['GET','HEAD','OPTIONS'].includes(req.method) && (req.headers.origin !== (process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`) || req.headers['x-requested-with'] !== 'DocsApp')) return res.status(403).json({ message: 'Invalid request origin' });
        const token = /(?:^|;\s*)docs_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
        req.session = token ? db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(hash(token), Date.now()) : null;
        req.user = req.session?.user ? db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user) : null;
        next();
    });
    app.get('/health', (req,res) => res.json({ status:'ok' }));
    app.get('/api/auth/config', (req,res) => {
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
        if (!req.session) {
            const token = randomBytes(32).toString('hex'), nonce = randomBytes(32).toString('hex');
            db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token), null, nonce, Date.now()+3600000);
            cookie(res,token,3600);
            req.session = { nonce };
        }
        res.json({ clientId:process.env.GOOGLE_CLIENT_ID, nonce:req.session.nonce, user:req.user || null });
    });
    app.post('/api/auth/google', async (req,res,next) => {
        if (!req.session || typeof req.body.credential !== 'string') return res.status(401).json({ message:'Reload the login page' });
        let identity;
        try { identity = verifyToken ? await verifyToken(req.body.credential) : (await google.verifyIdToken({ idToken:req.body.credential, audience:process.env.GOOGLE_CLIENT_ID })).getPayload(); }
        catch { return res.status(401).json({ message:'Google sign-in could not be verified' }); }
        if (!identity?.sub || !identity.email_verified || typeof identity.email !== 'string' || identity.nonce !== req.session.nonce) return res.status(401).json({ message:'Invalid Google identity' });
        try {
            const email = identity.email.toLowerCase();
            db.prepare('INSERT INTO users VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name').run(identity.sub,email,identity.name || email);
            db.prepare('DELETE FROM sessions WHERE token=?').run(req.session.token);
            const token = randomBytes(32).toString('hex');
            db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token),identity.sub,randomBytes(32).toString('hex'),Date.now()+86400000);
            cookie(res,token);
            res.json({ user:db.prepare('SELECT * FROM users WHERE id=?').get(identity.sub) });
        } catch(error) { next(error); }
    });
    app.post('/api/auth/logout', (req,res) => {
        if(req.session) db.prepare('DELETE FROM sessions WHERE token=?').run(req.session.token);
        cookie(res,'',0); res.json({ ok:true });
    });
    app.use('/api/documents', (req,res,next) => req.user ? next() : res.status(401).json({ message:'Please sign in' }));
    const roleFor = (doc,user) => doc.owner === user.id ? 'owner' : db.prepare('SELECT role FROM permissions WHERE document=? AND email=?').get(doc.id,user.email)?.role;
    const present = (doc,user) => ({ ...doc, role:roleFor(doc,user) });
    function fields(body) {
        if(typeof body.title !== 'string' || body.title.length > 200 || typeof body.content !== 'string') return null;
        return { title:body.title.trim() || 'Untitled document', content:sanitize(body.content, {
            allowedTags:sanitize.defaults.allowedTags.concat(['font','mark']),
            allowedAttributes:{ '*':['style'], font:['color','face','size'] },
            allowedStyles:{ '*':{
                color:[/^#[0-9a-f]{3,8}$/i,/^rgba?\([\d\s,.%]+\)$/i,/^[a-z]+$/i],
                'background-color':[/^#[0-9a-f]{3,8}$/i,/^rgba?\([\d\s,.%]+\)$/i,/^[a-z]+$/i],
                'text-align':[/^(left|right|center|justify)$/], 'font-family':[/^[\w\s,"'-]+$/],
                'font-size':[/^\d+(px|pt|em|rem|%)$/], 'font-weight':[/^(bold|normal|[1-9]00)$/],
                'font-style':[/^(italic|normal)$/], 'text-decoration':[/^(underline|line-through|none)$/]
            }}
        }), updatedAt:new Date().toISOString() };
    }
    app.get('/api/documents', (req,res) => res.json(db.prepare('SELECT DISTINCT d.* FROM documents d LEFT JOIN permissions p ON p.document=d.id WHERE d.owner=? OR p.email=? ORDER BY d.updatedAt DESC').all(req.user.id,req.user.email).map(doc=>present(doc,req.user))));
    app.post('/api/documents', (req,res) => {
        const data=fields(req.body);
        if(!data) return res.status(400).json({ message:'Title (max 200 characters) and content must be text' });
        const doc={ id:randomUUID(), owner:req.user.id, ...data };
        db.prepare('INSERT INTO documents VALUES (?,?,?,?,?)').run(doc.id,doc.owner,doc.title,doc.content,doc.updatedAt);
        res.status(201).json(present(doc,req.user));
    });
    app.use('/api/documents/:id', (req,res,next) => {
        const doc=db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
        if(!doc || !roleFor(doc,req.user)) return res.status(404).json({ message:'Document not found or access removed' });
        req.doc=doc; req.role=roleFor(doc,req.user); next();
    });
    app.get('/api/documents/:id', (req,res) => res.json(present(req.doc,req.user)));
    app.put('/api/documents/:id', (req,res) => {
        if(req.role==='viewer') return res.status(403).json({ message:'Viewers cannot edit' });
        const data=fields(req.body);
        if(!data) return res.status(400).json({ message:'Invalid title or content' });
        db.prepare('UPDATE documents SET title=?,content=?,updatedAt=? WHERE id=?').run(data.title,data.content,data.updatedAt,req.doc.id);
        res.json(present({...req.doc,...data},req.user));
    });
    app.delete('/api/documents/:id', (req,res) => {
        if(req.role!=='owner') return res.status(403).json({ message:'Only the owner can delete' });
        db.prepare('DELETE FROM documents WHERE id=?').run(req.doc.id); res.json({ok:true});
    });
    app.use('/api/documents/:id/permissions', (req,res,next) => req.role==='owner' ? next() : res.status(403).json({message:'Only the owner can manage sharing'}));
    app.get('/api/documents/:id/permissions', (req,res) => res.json(db.prepare('SELECT email,role FROM permissions WHERE document=?').all(req.doc.id)));
    app.put('/api/documents/:id/permissions', (req,res) => {
        const email=typeof req.body.email==='string' ? req.body.email.trim().toLowerCase() : '';
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !['viewer','editor'].includes(req.body.role)) return res.status(400).json({message:'Enter a valid email and role'});
        if(email===req.user.email) return res.status(400).json({message:'The owner already has full access'});
        db.prepare('INSERT INTO permissions VALUES (?,?,?) ON CONFLICT(document,email) DO UPDATE SET role=excluded.role').run(req.doc.id,email,req.body.role);
        res.json({email,role:req.body.role});
    });
    app.delete('/api/documents/:id/permissions', (req,res) => {
        if(typeof req.body.email!=='string') return res.status(400).json({message:'Email required'});
        db.prepare('DELETE FROM permissions WHERE document=? AND email=?').run(req.doc.id,req.body.email.trim().toLowerCase()); res.json({ok:true});
    });
    app.use(express.static(path.join(__dirname,'../frontend')));
    app.use((error,req,res,next) => {
        console.error(error.message);
        res.status(error.status===413 ? 413 : 500).json({message:error.status===413 ? 'Document is too large' : 'Request failed'});
    });
    app.locals.db=db;
    return app;
}
module.exports={createApp};
