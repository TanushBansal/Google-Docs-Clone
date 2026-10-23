require('dotenv').config();
const {createApp}=require('./app');
if(!process.env.GOOGLE_CLIENT_ID) { console.error('Set GOOGLE_CLIENT_ID in backend/.env; see README.md'); process.exit(1); }
const port=Number(process.env.PORT || 3000);
createApp().listen(port,()=>console.log(`Open http://localhost:${port}`));
