const mongoose = require('mongoose')


const itemSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    linkdetail: {
        type: String,
        required: true
    },
    level: {
        type: String,
        required: true,
    },
    sdktype: {
        type: String,
        required: true,
    },
    companyid: {
        type: String,
        required: false,
    },

})

module.exports = mongoose.model('Item', itemSchema)