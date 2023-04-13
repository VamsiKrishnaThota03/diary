const redis = require('redis');
const express = require('express');
const bodyparser = require('body-parser');   
const mongoose = require('mongoose');
const methodOverride = require('method-override');

const app = express();
const port = 3000;

app.set('view engine','ejs');

// serving static files
app.use(express.static('public'))

// body parser middleware
app.use(bodyparser.urlencoded({extended: false}));

// parse application/json
app.use(bodyparser.json());

// middleware for method-override
app.use(methodOverride('_method'));

// database url
const url = 'mongodb+srv://vamsikrishna:Tvkrishna%401@cluster0.ndjryo4.mongodb.net/Diary?retryWrites=true&w=majority';

// mongoose helps to connect to the database and interact with the database
// connecting application with the database
mongoose.set('strictQuery', false);
mongoose.connect(url,{
    useNewUrlParser:true,
    useUnifiedTopology:true
}).then(console.log("Mongo DB connected"))
.catch(err=> console.log(err))

// import diary module
const Diary = require('./models/Diary');

// routing

// route for /
app.get('/',(req,res)=>{
    res.render('Home');        
});

// route for about page
app.get('/about',(req,res)=>{
    res.render('about');
})

// route for diary
app.get('/diary',(req,res)=>{
    Diary.find().then(data=>{    
        res.render('Diary',{ data:data });
        // console.log(data);
    }).catch(err=>{
        console.log(err);
    })
})


// route for adding records
app.get('/add',(req,res)=>{
    res.render('add');
})


// route for saving diaries
app.post('/add-to-diary',async(req,res)=>{
    // res.send(req.body.title);
    const data = new Diary({
        title:req.body.title,
        description:req.body.description,
        date:req.body.date
    })
    
    await data.save().then(()=>{
        res.redirect('/diary');
    }).catch(err=>{
        console.log(err);
    })

    
})

// route for displaying records
app.get('/diary/:id',(req,res)=>{
    Diary.findOne({
        _id:req.params.id
    }).then(data=>{
        res.render('page',{data:data})
    }).catch(err=>{
        console.log(err);
    })
})


// route for edit page
app.get('/diary/edit/:id',(req,res)=>{
    Diary.findOne({
        _id:req.params.id
    }).then(data=>{
        res.render('edit',{data:data})
    }).catch(err=>{
        console.log(err);
    })
})


// edit data
app.put('/diary/edit/:id',(req,res)=>{
    Diary.findOne({
        _id:req.params.id
    }).then(data=>{
        data.title = req.body.title
        data.description = req.body.description
        data.date = req.body.date
        data.save().then(()=>{
            res.redirect('/diary')
        }).catch(err=>console.log(err))
    }).catch(err=>console.log(err))
})



// creating a server
app.listen(port,()=>{
    console.log(`Listening to port ${port}`);
});