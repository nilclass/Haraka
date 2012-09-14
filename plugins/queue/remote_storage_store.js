
var console = require('console');

var remoteStorage = require('./remoteStorage.js/build/latest/remoteStorage-node-debug');

remoteStorage.defineModule('messages', function(privateClient) {

  privateClient.sync('');

  return {
    exports: {
      addRaw: function(id, lines) {
        privateClient.storeObject('rfc822', "raw/" + id, {
          lines: lines
        });
      }
    }
  }

});

var config;

function storeMessage(transaction, callback) {
  remoteStorage.messages.addRaw(transaction.uuid, transaction.data_lines);
  remoteStorage.syncNow('/messages/', callback);
}

exports.hook_init_master = function(next) {
  config = this.config.get('remote_storage.ini').main;

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