const express = require('express');
const path = require('node:path');
const mongoose = require('mongoose');
const {randomBytes, createHash} = require('node:crypto');
const {OAuth2Client} = require('google-auth-library');
const Document = require('./models/Document');
const documentRoutes = require('./routes/docroutes');
function createApp({connection = mongoose.connection, verifyToken} = {}) {
    const User = connection.models.User || connection.model('User', new mongoose.Schema({_id:String,email:{type:String,required:true,unique:true},name:String}));
    const Session = connection.models.Session || connection.model('Session', new mongoose.Schema({_id:String,user:String,nonce:String,expires:{type:Date,expires:0}}));
    const Documents = connection.models.Document || connection.model('Document', Document.schema);
    const google = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const hash = value => createHash('sha256').update(value).digest('hex');
    const cookie = (res,token,age=86400) => res.setHeader('Set-Cookie', `docs_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${process.env.NODE_ENV==='production'?'; Secure':''}`);
    const presentUser = user => user ? {id:user._id,email:user.email,name:user.name} : null;
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({limit:'1mb'}));
    app.use(async (req,res,next) => {
        res.setHeader('X-Content-Type-Options','nosniff');
        if(req.path.startsWith('/api/')) res.setHeader('Cache-Control','no-store');
        
const allowedOrigins = new Set([
    process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`,
    'http://localhost:5173'
]);

if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    (
        !allowedOrigins.has(req.headers.origin) ||
        req.headers['x-requested-with'] !== 'DocsApp'
    )
) {
    return res.status(403).json({ message: 'Invalid request origin' });
}

        const token = /(?:^|;\s*)docs_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
        req.session = token ? await Session.findOne({_id:hash(token),expires:{$gt:new Date()}}) : null;
        req.user = req.session?.user ? await User.findById(req.session.user) : null;
        next();
    });
    app.get('/health',(req,res)=>res.json({status:'ok'}));
    app.get('/api/auth/config',async(req,res)=>{
        if(!req.session){
            const token=randomBytes(32).toString('hex');
            req.session=await Session.create({_id:hash(token),nonce:randomBytes(32).toString('hex'),expires:new Date(Date.now()+3600000)});
            cookie(res,token,3600);
        }
        res.json({clientId:process.env.GOOGLE_CLIENT_ID,nonce:req.session.nonce,user:presentUser(req.user)});
    });
    app.post('/api/auth/google',async(req,res)=>{
        if(!req.session || typeof req.body?.credential!=='string') return res.status(401).json({message:'Reload the login page'});
        let identity;
        try{identity=verifyToken ? await verifyToken(req.body.credential) : (await google.verifyIdToken({idToken:req.body.credential,audience:process.env.GOOGLE_CLIENT_ID})).getPayload();}
        catch{return res.status(401).json({message:'Google sign-in could not be verified'});}
        if(!identity?.sub || !identity.email_verified || typeof identity.email!=='string' || identity.nonce!==req.session.nonce) return res.status(401).json({message:'Invalid Google identity'});
        const email=identity.email.toLowerCase();
        const user=await User.findByIdAndUpdate(identity.sub,{$set:{email,name:identity.name || email}},{upsert:true,returnDocument:'after',runValidators:true});
        const consumed=await Session.findOneAndDelete({_id:req.session._id,expires:{$gt:new Date()}});
        if(!consumed) return res.status(401).json({message:'Reload the login page'});
        const token=randomBytes(32).toString('hex');
        await Session.create({_id:hash(token),user:user._id,nonce:randomBytes(32).toString('hex'),expires:new Date(Date.now()+86400000)});
        cookie(res,token);res.json({user:presentUser(user)});
    });
    app.post('/api/auth/logout',async(req,res)=>{
        if(req.session) await Session.deleteOne({_id:req.session._id});
        cookie(res,'',0);res.json({ok:true});
    });
    app.use('/api/documents',(req,res,next)=>req.user?next():res.status(401).json({message:'Please sign in'}),documentRoutes(Documents));
    const frontendPath = process.env.NODE_ENV === 'production'
    ? path.join(__dirname, '../dist')
    : path.join(__dirname, '../frontend');

app.use(express.static(frontendPath));
    app.use((error,req,res,next)=>{
        console.error(error.message);
        const status=[400,413].includes(error.status)?error.status:500;
        res.status(status).json({message:status===413?'Document is too large':status===400?'Invalid request body':'Request failed'});
    });
    app.locals.models={User,Session,Document:Documents};
    return app;
}
module.exports={createApp};
