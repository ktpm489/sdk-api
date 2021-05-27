const mongoose = require('mongoose')


const sdkSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    sdktype: {
        type: String,
        required: true
    },
    isactive: {
        type: Boolean,
        required: false,
        default: true
    }

})

module.exports = mongoose.model('Sdk', sdkSchema)