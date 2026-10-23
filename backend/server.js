require('dotenv').config({path:require('node:path').join(__dirname,'.env')});
const mongoose=require('mongoose');
const {createApp}=require('./app');
async function startServer(){
    if(!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env');
    if(!process.env.GOOGLE_CLIENT_ID) throw new Error('Set GOOGLE_CLIENT_ID in backend/.env');
    await mongoose.connect(process.env.MONGODB_URI);
    const port=Number(process.env.PORT || 3000);
    return createApp().listen(port,()=>console.log(`Connected to MongoDB. Open http://localhost:${port}`));
}
if(require.main===module) startServer().catch(error=>{console.error('Failed to start server:',error.message);process.exitCode=1;});
module.exports={startServer};
