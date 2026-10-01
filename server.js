const express=require('express');
const app=express();
app.use(express.json());
app.use(express.static('public'));
app.get('/health',(req,res)=>res.json({ok:true}));
const port=3000;
app.listen(port,'0.0.0.0',()=>console.log('Shopee AFF AI Ads listening on',port));