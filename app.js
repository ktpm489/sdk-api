const express = require('express')
const mongoose = require('mongoose')
// const url = 'mongodb://localhost/AlienDBex'
const url = 'mongodb+srv://demo1234:P7x98AGGptztPYtj@cluster0.v7jwx.mongodb.net/tikitechsdk?retryWrites=true&w=majority'

const app = express()

mongoose.connect(url, { useNewUrlParser: true } )
const con = mongoose.connection

con.on('open', () => {
    console.log('connected...')
})

app.use(express.json())

const sdkRouter = require('./routes/sdk')
const itemRouter = require('./routes/item')
app.use('/sdk', sdkRouter)
app.use('/itemSdk', itemRouter)
app.use((req, res, next) => {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

app.use((err, req, res, next) => {
    res.locals.error = err;
    const status = err.status || 500;
    res.status(status);
    res.render('error');
});
var port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log('Server started')
})