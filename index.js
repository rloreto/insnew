
var process = require('process');
require('dotenv').load();
var mongoose = require('mongoose');
var http = require('http');
var Promise = require('bluebird');
var axios = require('axios');
var FormData = require('form-data');
const clearInterval = require('timers');
var fs = require('fs'); 
var _ = require('lodash');
var parse = require('csv-parse');
var randomstring = require("randomstring");
var TempMailbox = require('rr-guerrillamail')
var ProxyLists = require('proxy-lists');

String.prototype.replaceAll = function(search, replacement) {
  var target = this;
  return target.split(search).join(replacement);
};

var user_mongo = process.env.USER_MONGO;
var pwd_mongo = process.env.PWD_MONGO;


mongoose.connect('mongodb://ds123695.mlab.com:23695/instagram', { auth: {
    user: user_mongo,
    password: pwd_mongo
}});

mongoose.Promise = Promise;
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));


var InstagramUser = mongoose.model('InstagramUser', {
  username: String,
  password: String,
  email: String,
  fullName: String,
  challangePending: Boolean
});

var proxyServer = ''
var proxyPort = ''
  

var options = {
  anonymityLevels: ['transparent'],
  bitproxies: { apiKey: '8GssmgaqNfwNcPIvSK0kHUo8zqTicrSY' },
  kingproxies: { apiKey: 'ccccbbae267a98bfefa043722079b3' }
};
/*
var gettingProxies = ProxyLists.getProxies(options);
//var gettingProxies = ProxyLists.getProxiesFromSource('freeproxylists', options);

gettingProxies.on('data', function(proxies) {
  // Received some proxies.
  debugger;
});

gettingProxies.once('end', function() {
  // Done getting proxies.
  debugger;
});*/

var getCsv = function (file) {

  var promise = new Promise(function(resolve) {
    var csvData=[];
    var flag= false;
    fs.createReadStream(file)
    .pipe(parse({delimiter: ':'}))
    .on('data', function(csvrow, i) {
      if (flag) {
        csvData.push(csvrow); 
      }      
      flag = true;
    })
    .on('end',function() {
      resolve(csvData);
    });
  
  });
  return promise;
}

var getRandomInt = function(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

var getRandomArbitrary = function (min, max) {
  return Math.round(Math.random() * (max - min) + min, 0);
}
var getUserName = function (names, surnames) {
  var number  = getRandomInt(names.length)-1;
  var name = names[number];
  number  = getRandomInt(surnames.length)-1;
  var surname = surnames[number];

  return { username: name + '.' + surname + '.' + getRandomArbitrary(100, 99999), name: name};
}

var getRequestObject = function(url, data, context) {
  var intenalData = '';
  var cookie=  '';
  if(data && !data._boundary){
    for(var i in data) {
      intenalData += i + '=' + data[i] + ';'
    }
  } else if (data && data._boundary) {
    intenalData = data;
  }
  var headers = {
    'referer': 'https://www.instagram.com/',
    'origin' : 'https://www.instagram.com',
    'user-agent' : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.167 Safari/537.36',
    'x-instagram-ajax' : '1',
    'x-requested-with' : 'XMLHttpRequest'
  };


  if(context && context.csrftoken ){
    headers['x-csrftoken'] =  context.csrftoken;
    cookie +='csrftoken=' + context.csrftoken + ";"
  }
  if(context && context.sessionid){
    cookie +='sessionid=' + context.sessionid + ";"
  }

  headers['cookie'] = cookie; 


  var obj = {
    method: 'post',
    url: url,
    data: intenalData,
    headers : headers,
    ciphers: 'ALL',
    secureProtocol: 'TLSv1_method'
  }
  
  if(proxyServer && proxyPort) {
    obj['proxy'] = {
      host: proxyServer,
      port: proxyPort,
      protocol: 'https' 
    };
  }

  return obj;
}

getSetMailObjectRequest = (user) => {
  return {
    method: 'post',
    url: 'https://www.guerrillamail.com/ajax.php?f=set_email_user',
    data: 'email_user=' + user.email +';lang=en;site=guerrillamail.com'
  }
}

var getCookie = function (response, key) {
  var cookies = response.headers['set-cookie'];
  for(var i in cookies)
  {
    if(cookies[i].split('=')[0] == key){
      return cookies[i].split(';')[0].replace(key + '=','');
      break;
    }  
  }
}

const createInstagramUser = (obj) => {

  return new Promise(function(resolve) {
    var form = new FormData();

    
    const url = "https://www.instagram.com";
    var csrfToken;
    var sessionid;

    var promise1 = getCsv('hombres.csv');
    var promise2 = getCsv('mujeres.csv');
    var promise3 = getCsv('apellidos.csv');

    var mailbox = new TempMailbox();
    var promise4 =  mailbox.getEmailAddress()

    Promise.all([promise1,promise2,promise3, promise4]).then(function(data) {
      var names = _.map(data[1], function(item){
        return item[0].split(',')[0].replaceAll(' ','.').toLowerCase();;
      });

      var surnames = _.map(data[2], function(item){
        return item[0].split(',')[0].replaceAll(' ','.').toLowerCase();
      });

      var  obj = getUserName(names, surnames);
      var username = obj.username;
      var email =  data[3];
      var password = randomstring.generate(10);
      var first_name= obj.name;
      var dataObject = { email: email, password: password, username: username, first_name: first_name};

      
      axios.get(url).then(response => {
        csrfToken = getCookie(response, 'csrftoken');
        return axios(getRequestObject('https://www.instagram.com/accounts/web_create_ajax/attempt/', dataObject, { csrftoken : csrfToken }))
    
      })
      .then(function (response) {
        if(response && response.data.dryrun_passed) {
          dataObject = { email: email, password: password, username: username, first_name: first_name, seamless_login_enabled: 1};
          return axios(getRequestObject('https://www.instagram.com/accounts/web_create_ajax/', dataObject, { csrftoken : csrfToken }))
        }
      })
      .then(function (response) {
        debugger;
        if (response) {
          sessionid = getCookie(response, 'sessionid');
          var instagramUser = new InstagramUser({ 
            username: dataObject.username, 
            password: dataObject.password, 
            email: dataObject.email, 
            fullName: dataObject.first_name 
          });
          instagramUser.save();

          console.log(response.data);

          
          if(response.data && response.data.account_created) {
            resolve(dataObject, { csrftoken : csrfToken, sessionid: sessionid }, mailbox);
          }
        }
      })
      .catch(function (res) {
        debugger;
          if(res.message){
            console.error(res.message);
          }
          
          console.log(dataObject);
          if(res.response && res.response.status === 400 && res.response.data.message === 'checkpoint_required') {
            
            InstagramUser.findOne({ username: dataObject.username}).then( function(item) {
              if(item){
                item.challangePending = true;
                item.save();
              }
            });
          }
      });
      

    });
  });
}
  


createInstagramUser(createInstagramUser).then(function(user, context, mailbox){
  
    mailbox.waitForEmail(function(m) {
        debugger;
        return (m.mail_subject.indexOf('xyzzy') != -1);
    })
    .then(function(mail) {
      // log out the entire object of the email which matched
      // including mail_body, which is the content
      console.log(JSON.stringify(mail, null, 2));
      
      // delete the resulting email
      mailbox.deleteMail(mail.mail_id);
    });
});



  
  