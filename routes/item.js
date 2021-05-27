const express = require('express')
const router = express.Router()
const Item = require('../models/item')


router.get('/', async(req,res) => {
    try{
           const item = await Item.find()
           res.json(item)
    }catch(err){
        res.send('Error ' + err)
    }
})

router.get('/:id', async(req,res) => {
    try{
        const item = await Item.findById(req.params.id)
           res.json(item)
    }catch(err){
        res.send('Error ' + err)
    }
})

router.get("/itemByIds", async (req, res) => {
    try {
        let level = req.query.level;
        let sdktype = req.query.sdktype;
        const item = await Item.find(
            { level: level, sdktype: sdktype },
            { __v: 0 }
        );
        res.json(item);
    } catch (err) {
        res.send("Error " + err);
    }
});


router.post('/', async(req,res) => {
    const item = new Item({
        name: req.body.name,
        image: req.body.image,
        title: req.body.title,
        description: req.body.description,
        linkdetail: req.body.linkdetail,
        level: req.body.level,
        sdktype: req.body.sdktype,
        companyid: req.body.companyid !== undefined ? req.body.companyid : '',
    })

    try{
        const a1 =  await item.save() 
        res.json(a1)
    }catch(err){
        res.send('Error')
    }
})

router.patch('/:id',async(req,res)=> {
    try{
        const item = await Item.findById(req.params.id)
        item.name =  req.body.name !== undefined ? req.body.name : item.name,
        item.image=  req.body.image!== undefined ? req.body.image : item.image,
        item.title = req.body.title !== undefined ? req.body.title : item.title,
        item.description = req.body.description!== undefined ? req.body.description : item.description,
        item.linkdetail = req.body.linkdetail !== undefined ? req.body.linkdetail :item.linkdetail,
        item.level = req.body.level !== undefined ? req.body.level : item.level,
        item.sdktype = req.body.sdktype !== undefined ? req.body.sdktype :item.sdktype
        item.companyid = req.body.companyid !== undefined ? req.body.companyid : item.companyid
        const a1 = await item.save()
        res.json(a1)   
    }catch(err){
        res.send('Error')
    }

})

module.exports = router