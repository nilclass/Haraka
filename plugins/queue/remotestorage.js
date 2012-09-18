
var console = require('console');

var remoteStorage = require('../remoteStorage.js/build/latest/remoteStorage-node-debug');

remoteStorage.defineModule('messages', function(client) {

  client.sync('');

  function messagePath(id) {
    return 'pool/' + id;
  }

  return {
    exports: {

      validateMessage: function(message) {

        var errors = {};

        if(! message.id) {
          message.id = getUuid();
        }

        function addError(key, message) {
          if(! (key in errors)) {
            errors[key] = [];
          }
          errors[key].push(message);
        }

        function validateAttrPresence() {
          var object = arguments[0], key;

          for(var i=1;i<arguments.length;i++) {
            key = arguments[i];
            if(! object[key]) {
              addError(key, "required");
            }
          }
        }

        validateAttrPresence(message, 'from', 'to', 'body');

        if(message.body && (! message.subject)) {
          message.subject = makeSubject(message.body);
        }

        return errors;
      },

      storeMessage: function(message, callback) {

        var errors = this.validateMessage(message);

        console.log('validated, errors: ', errors);

        if(Object.keys(errors).length > 0) {
          return callback(errors, null);
        } else {

          client.storeObject('message', messagePath(message.id), message, callback);

          console.log('message stored', messagePath(message.id), message);

          remoteStorage.syncNow('/');
        }

      },
    }
  }

});

var config;

function cleanHeaders(headers) {
  console.log('CLEAN HEADERS', headers);
  var keys = Object.keys(headers);
  var h = {};
  keys.forEach(function(key) {
    var values = [];
    for(var i=0;i<headers[key].length;i++) {
      values.push(headers[key][i].replace(/\n\t?/g, ''));
    }
    h[key] = values;
  });
  return h;
}

function transformBody(body) {
  var b = {};

  function contentType(part) {
    return part.header.get('content-type') || (part.is_html ? 'text/html' : 'text/plain');
  }

  if(body.children.length > 0) {
    body.children.forEach(function(child) {
      b[contentType(child)] = child.bodytext;
    });
  } else {
    b[contentType(body)] = body.bodytext;
  }
  return b;
}

function storeMessage(transaction, callback) {

  var headers = cleanHeaders(transaction.header.headers);

  var message = {
    id: transaction.uuid,
    headers: headers,
    from: transaction.mail_from.toString(),
    to: transaction.rcpt_to.toString(),
    subject: headers.subject,
    body: transformBody(transaction.body)
  }
  remoteStorage.messages.storeMessage(message, callback);
}

exports.hook_init_master = function(next) {
  config = this.config.get('remotestorage.ini').main;

  remoteStorage.claimAccess('messages');

  remoteStorage.nodeConnect.setUserAddress(config.userAddress, function(err) {
    if(err) {
      process.exit();
    } else {
      remoteStorage.nodeConnect.setBearerToken(config.token);

      console.log("remoteStorage is configured", remoteStorage.getStorageHref());

      next();
    }
  });
}


exports.hook_data = function(next, connection) {
  connection.transaction.parse_body = 1

  next();
}

exports.hook_queue = function(next, connection) {
  storeMessage(connection.transaction, function(err) {
    if(err) {
      console.error("ERROR STORING MESSAGE", err);
      next(CONT);
    } else {
      console.log("Message " + connection.transaction.uuid + " persisted to remoteStorage");
      next(OK);
    }
  });
}