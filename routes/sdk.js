const express = require('express')
const router = express.Router()
const Sdk = require('../models/sdk')


router.get('/', async(req,res) => {
    try{
        const sdk = await Sdk.find()
           res.json(sdk)
    }catch(err){
        res.send('Error ' + err)
    }
})

router.get('/:id', async(req,res) => {
    try{
        const sdk = await Sdk.findById(req.params.id)
           res.json(sdk)
    }catch(err){
        res.send('Error ' + err)
    }
})


router.post('/', async(req,res) => {
    console.log('req', req.body.description)
    const sdk = new Sdk({
        name: req.body.name,
        description: req.body.description,
        sdktype: req.body.sdktype
    })

    try{
        const a1 =  await sdk.save() 
        console.log('a1', a1)
        res.json(a1)
    }catch(err){
        // res.send('Error', err)
        res.status('404').send({'Error' : err.message})
    }
})

router.patch('/:id',async(req,res)=> {
    try{
        const sdk = await Sdk.findById(req.params.id) 
        if (req.body.sdktype)
        sdk.sdktype = req.body.sdktype
        const a1 = await sdk.save()
        res.json(a1)   
    }catch(err){
        res.send('Error')
    }

})

module.exports = router