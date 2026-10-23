const express = require('express');
const mongoose = require('mongoose');
const fields = require('../document-fields');
module.exports = function documentRoutes(Document) {
    const router=express.Router();
    const roleFor=(doc,user)=>doc.owner===user._id?'owner':doc.permissions.find(p=>p.email===user.email)?.role;
    const present=(doc,user)=>({id:doc.id,title:doc.title,content:doc.content,updatedAt:doc.updatedAt,role:roleFor(doc,user)});
    router.get('/',async(req,res)=>{
        const docs=await Document.find({$or:[{owner:req.user._id},{'permissions.email':req.user.email}]}).sort({updatedAt:-1});
        res.json(docs.map(doc=>present(doc,req.user)));
    });
    router.post('/',async(req,res)=>{
        const data=fields(req.body || {});
        if(!data) return res.status(400).json({message:'Title (max 200 characters) and content must be text'});
        const doc=await Document.create({...data,owner:req.user._id});
        res.status(201).json(present(doc,req.user));
    });
    router.use('/:id',async(req,res,next)=>{
        if(!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({message:'Invalid document ID'});
        const doc=await Document.findById(req.params.id);
        if(!doc || !roleFor(doc,req.user)) return res.status(404).json({message:'Document not found or access removed'});
        req.doc=doc;req.role=roleFor(doc,req.user);next();
    });
    router.get('/:id',(req,res)=>res.json(present(req.doc,req.user)));
    router.put('/:id',async(req,res)=>{
        if(req.role==='viewer') return res.status(403).json({message:'Viewers cannot edit'});
        const data=fields(req.body || {});
        if(!data) return res.status(400).json({message:'Invalid title or content'});
        Object.assign(req.doc,data);await req.doc.save();res.json(present(req.doc,req.user));
    });
    router.delete('/:id',async(req,res)=>{
        if(req.role!=='owner') return res.status(403).json({message:'Only the owner can delete'});
        await req.doc.deleteOne();res.json({ok:true});
    });
    router.use('/:id/permissions',(req,res,next)=>req.role==='owner'?next():res.status(403).json({message:'Only the owner can manage sharing'}));
    router.get('/:id/permissions',(req,res)=>res.json(req.doc.permissions.map(({email,role})=>({email,role}))));
    router.put('/:id/permissions',async(req,res)=>{
        const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !['viewer','editor'].includes(req.body.role)) return res.status(400).json({message:'Enter a valid email and role'});
        if(email===req.user.email) return res.status(400).json({message:'The owner already has full access'});
        const permission=req.doc.permissions.find(p=>p.email===email);
        if(permission) permission.role=req.body.role;else req.doc.permissions.push({email,role:req.body.role});
        await req.doc.save();res.json({email,role:req.body.role});
    });
    router.delete('/:id/permissions',async(req,res)=>{
        if(typeof req.body?.email!=='string') return res.status(400).json({message:'Email required'});
        req.doc.permissions=req.doc.permissions.filter(p=>p.email!==req.body.email.trim().toLowerCase());
        await req.doc.save();res.json({ok:true});
    });
    return router;
};
