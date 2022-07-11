console.log('In main.js');

var usernameInput = document.querySelector('#username');
var btnJoin = document.querySelector('#btn-join');

var mapPeers = {};

var mapScreenPeers = {};
var screenShared = false;

var btnShareScreen = document.querySelector('#btn-share-screen');

var username;

var loc = window.location;
var wsStart = "ws://";

if (loc.protocol == "https:"){
   wsStart = "wss://";
}

var endPoint = wsStart + loc.host + loc.pathname;

console.log("endPoint; ", endPoint);

var webSocket;

function webSocketOnMessage(event){
  
   var parseData = JSON.parse(event.data);
   
   var peerUsername = parseData['peer'];
   var action = parseData['action'];

   if(username == peerUsername){
      return;
   }

   var remoteScreenSharing = parseData['message']['local_screen_sharing'];
   console.log('remoteScreenSharing: ', remoteScreenSharing);


   var receiver_channel_name = parseData['message']['receiver_channel_name'];

   if(action == 'new-peer'){
      createOfferer(peerUsername, false, remoteScreenSharing, receiver_channel_name);

      if(screenShared && !remoteScreenSharing){
         createOfferer(peerUsername, true, remoteScreenSharing, receiver_channel_name);
      
      }
      return;
   }

   var localScreenSharing = parseData['message']['remote_screen_sharing'];

   if(action == 'new-offer'){
      var offer = parseData['message']['sdp'];

      var peer = createAnswerer(offer, peerUsername, localScreenSharing, remoteScreenSharing, receiver_channel_name);

      return;
   }

   if(action == 'new-answer'){
      var answer = parseData['message']['sdp'];

      var peer = null;

      if(remoteScreenSharing){
         peer = mapPeers[peerUsername + ' Screen'][0];
      }
      else if(localScreenSharing){
         peer = mapScreenPeers[peerUsername][0];
      }
      else{
         peer = mapPeers[peerUsername][0];
      }

      peer.setRemoteDescription(answer);

      return;
   }

}

btnJoin.addEventListener('click', () => {
   username = usernameInput.value;

   console.log("username : ", username);

   if(username == ''){
      return;
   }

   usernameInput.value = '';
   usernameInput.disabled = true;
   usernameInput.style.visibility = 'hidden';
   
   btnJoin.disabled = true;
   btnJoin.style.visibility = 'hidden';

   var labelUsername = document.querySelector('#label-username');
   labelUsername.innerHTML = username;

   

   webSocket = new WebSocket(endPoint);

   webSocket.addEventListener("open", (e) => {
      console.log("connection open");

      sendSignal('new-peer', {
         'local_screen_sharing': false,
      });

   });

   webSocket.addEventListener("message", webSocketOnMessage);

   webSocket.addEventListener("close", (e) => {
      console.log("connection close");
   });

   webSocket.addEventListener("error", (e) => {
      console.log("error found");
   });

});

var localStream = new MediaStream();
var localDisplayStream = new MediaStream();

const constraints = {
   'video': true,
   'audio': true
};


const localVideo = document.querySelector('#local-video');

const btnToggleAudio = document.querySelector('#btn-toggle-audio');
const btnToggleVideo = document.querySelector('#btn-toggle-video');


var userMedia = navigator.mediaDevices.getUserMedia(constraints)
   .then(stream => {
      localStream = stream;
      localVideo.srcObject = localStream;
      localVideo.muted = true;

      var audioTracks = stream.getAudioTracks();
      var videoTracks = stream.getVideoTracks();

      audioTracks[0].enabled = true;
      videoTracks[0].enabled = true;

      btnToggleAudio.addEventListener('click', () =>{
         audioTracks[0].enabled = !audioTracks[0].enabled;

         if(audioTracks[0].enabled){
            btnToggleAudio.innerHTML = 'Audio Mute';

            return;
         }

         btnToggleAudio.innerHTML = 'Audio Unmute';
      });

      btnToggleVideo.addEventListener('click', () =>{
         videoTracks[0].enabled = !videoTracks[0].enabled;

         if(videoTracks[0].enabled){
            btnToggleVideo.innerHTML = 'Video Off';

            return;
         }

         btnToggleVideo.innerHTML = 'Video On';
      });
   })
   .then(e => {
      btnShareScreen.onclick = event => {
            if(screenShared){
                screenShared = !screenShared;

                localVideo.srcObject = localStream;
                btnShareScreen.innerHTML = 'Share screen';

                var localScreen = document.querySelector('#my-screen-video');
                removeVideo(localScreen);

                var screenPeers = getPeers(mapScreenPeers);
                for(index in screenPeers){
                    screenPeers[index].close();
                }
                mapScreenPeers = {};

                return;
            }
            
            screenShared = !screenShared;

            navigator.mediaDevices.getDisplayMedia(constraints)
                .then(stream => {
                    localDisplayStream = stream;
                    
                    var mediaTracks = stream.getTracks();
                    for(i=0; i < mediaTracks.length; i++){
                        console.log(mediaTracks[i]);
                    }

                    var localScreen = createVideo('my-screen');
                    // set to display stream
                    // if screen not shared
                    localScreen.srcObject = localDisplayStream;

                    // notify other peers
                    // of screen sharing peer
                    sendSignal('new-peer', {
                        'local_screen_sharing': true,
                    });
                })
                .catch(error => {
                    console.log('Error accessing display media.', error);
                });

            btnShareScreen.innerHTML = 'Stop sharing';
        }
   })
   .catch(error =>{
      console.log('error accessing media devices', error);
   })

var btnSendMsg = document.querySelector('#btn-send-msg');
var messageList = document.querySelector('#message-list');
var messageInput = document.querySelector('#msg');
btnSendMsg.addEventListener('click', sendMsgOnClick);

//this function send the message to the group
function sendMsgOnClick(){
   var message = messageInput.value;

   var li = document.createElement('li');
   li.appendChild(document.createTextNode('Me: '+ message));
   messageList.appendChild(li);

   var dataChannels = getDataChannels();

   message = username +': '+message;

   for(index in dataChannels){
      dataChannels[index].send(message);

   }
   messageInput.value = '';
}

//this function send the object to others
function sendSignal(action, message){
   var jsonStr = JSON.stringify({
      'peer': username,
      'action': action,
      'message' : message, 
   });

   webSocket.send(jsonStr);
}

function createOfferer(peerUsername, localScreenSharing, remoteScreenSharing, receiver_channel_name){
   var peer = new RTCPeerConnection(null);

   addLocalTracks(peer, localScreenSharing);

   var dc = peer.createDataChannel('channel');
   dc.addEventListener('open', ()=> {
      console.log('connection opened');
   });

   //dc.addEventListener('message', dcOnMessage);

   var remoteVideo = null ;
   if(!localScreenSharing && !remoteScreenSharing){
      dc.onmessage = dcOnMessage;

      remoteVideo = createVideo(peerUsername);
      setOnTrack(peer, remoteVideo);
      console.log('Remote video source: ', remoteVideo.srcObject);

      mapPeers[peerUsername] = [peer, dc];

      peer.addEventListener('iceconnectionstatechange', () => {
         var iceConnectionState = peer.iceConnectionState;
   
         if(iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed'){
            delete mapPeers[peerUsername];
   
            if(iceConnectionState != 'closed'){
               peer.close();
            }
   
            removeVideo(remoteVideo);
         }
      });
   }
   else if(!localScreenSharing && remoteScreenSharing){

      remoteVideo = createVideo(peerUsername + '-screen');
      setOnTrack(peer, remoteVideo);

      mapPeers[peerUsername + ' Screen'] = [peer, dc];

      peer.addEventListener('iceconnectionstatechange', () => {
         var iceConnectionState = peer.iceConnectionState;
   
         if(iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed'){
            delete mapPeers[peerUsername];
   
            if(iceConnectionState != 'closed'){
               peer.close();
            }
   
            removeVideo(remoteVideo);
         }
      });
   }
   else{
      mapPeers[peerUsername] = [peer, dc];

      peer.addEventListener('iceconnectionstatechange', () => {
         var iceConnectionState = peer.iceConnectionState;
   
         if(iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed'){
            delete mapPeers[peerUsername];
   
            if(iceConnectionState != 'closed'){
               peer.close();
            }
   
            //removeVideo(remoteVideo);
         }
      });
   }

   peer.addEventListener('icecandidate', (event) => {
      if(event.candidate){
         console.log('new ice candidate: ', JSON.stringify(peer.localDescription));

         return;
      }

      sendSignal('new-offer', {
         'sdp': peer.localDescription,
         'receiver_channel_name': receiver_channel_name,
         'local_screen_sharing': localScreenSharing,
         'remote_screen_sharing': remoteScreenSharing,
      });
   });

   peer.createOffer()
      .then(o => peer.setLocalDescription(o))
      .then(() => {
         console.log('local descriptionset successful');
      });
}

function createAnswerer(offer, peerUsername, localScreenSharing, remoteScreenSharing, receiver_channel_name){
   var peer = new RTCPeerConnection(null);

   addLocalTracks(peer, localScreenSharing);

   if(!localScreenSharing && !remoteScreenSharing){
      var remoteVideo = createVideo(peerUsername);
      
      setOnTrack(peer, remoteVideo);

      peer.addEventListener('datachannel', e => {
         peer.dc = e.channel;
         peer.dc.onmessage = dcOnMessage;
         peer.dc.addEventListener('open', ()=> {
            console.log('connection opened');
         });
      
         //peer.dc.addEventListener('message', dcOnMessage);
   
         mapPeers[peerUsername] = [peer, peer.dc];
   
      });

      peer.addEventListener('iceconnectionstatechange', () => {
         var iceConnectionState = peer.iceConnectionState;
   
         if(iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed'){
            delete mapPeers[peerUsername];
   
            if(iceConnectionState != 'closed'){
               peer.close();
            }
   
            removeVideo(remoteVideo);
         }
      });
   }
   else if(!localScreenSharing && remoteScreenSharing){
      
      peer.addEventListener('datachannel', e => {
         peer.dc = e.channel;
         //peer.dc.onmessage = dcOnMessage;
         peer.dc.addEventListener('open', ()=> {
            console.log('connection opened');
         });
      
         //peer.dc.addEventListener('message', dcOnMessage);
   
         mapPeers[peerUsername] = [peer, peer.dc];
   
      });

      peer.addEventListener('iceconnectionstatechange', () => {
         var iceConnectionState = peer.iceConnectionState;
   
         if(iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed'){
            delete mapPeers[peerUsername];
   
            if(iceConnectionState != 'closed'){
               peer.close();
            }
   
            //removeVideo(remoteVideo);
         }
      });
   }
   else{
      var remoteVideo = createVideo(peerUsername + '-screen');
      
      setOnTrack(peer, remoteVideo);

      peer.addEventListener('datachannel', e => {
         peer.dc = e.channel;
         //peer.dc.onmessage = dcOnMessage;
         peer.dc.addEventListener('open', ()=> {
            console.log('connection opened');
         });
      
         //peer.dc.addEventListener('message', dcOnMessage);
   
         mapPeers[peerUsername + ' Screen'] = [peer, peer.dc];
   
      });

      peer.addEventListener('iceconnectionstatechange', () => {
         var iceConnectionState = peer.iceConnectionState;
   
         if(iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed'){
            delete mapPeers[peerUsername];
   
            if(iceConnectionState != 'closed'){
               peer.close();
            }
   
            removeVideo(remoteVideo);
         }
      });
   }

   peer.addEventListener('icecandidate', (event) => {
      if(event.candidate){
         console.log('new ice candidate: ', JSON.stringify(peer.localDescription));

         return;
      }

      sendSignal('new-answer', {
         'sdp': peer.localDescription,
         'receiver_channel_name': receiver_channel_name,
         'local_screen_sharing': localScreenSharing,
         'remote_screen_sharing': remoteScreenSharing,
      });
   });

   peer.setRemoteDescription(offer)
      .then(() => {
         console.log('remote description set successfully for %s.', peerUsername);

         return peer.createAnswer();
      })
      .then(a =>{
         console.log('answer created');

         return peer.setLocalDescription(a);
      })
   
   return peer;
}

function addLocalTracks(peer, localScreenSharing){
   if(!localScreenSharing){
      localStream.getTracks().forEach(track => {
         peer.addTrack(track, localStream);
      });
   
      return;
   }

   localDisplayStream.getTracks().forEach(track =>{
      peer.addTrack(track, localDisplayStream);
   })
   
}


function dcOnMessage(event){
   var message = event.data;

   var li = document.createElement('li');
   li.appendChild(document.createTextNode(message));
   messageList.appendChild(li);
}

function createVideo(peerUsername){
   var videoContainer = document.querySelector('#video-container');

   var remoteVideo = document.createElement('video');

   remoteVideo.id = peerUsername + '-video';
   remoteVideo.autoplay = true;
   remoteVideo.playsInline = true;

   var videoWrapper = document.createElement('div');

   videoContainer.appendChild(videoWrapper);
   
   videoWrapper.appendChild(remoteVideo);

   return remoteVideo;
}

function setOnTrack(peer, remoteVideo){
   var remoteStream = new MediaStream();

   remoteVideo.srcObject = remoteStream;

   peer.addEventListener('track', async (event) => {
      remoteStream.addTrack(event.track, remoteStream);
   });
}

function removeVideo(video){
   var videoWrapper = video.parentNode;

   videoWrapper.parentNode.removeChild(videoWrapper);
}

function getDataChannels(){
   var dataChannels = [];

   for(peerUsername in mapPeers){
      var dataChannel = mapPeers[peerUsername][1];

      dataChannels.push(dataChannel);
   }

   return dataChannels;
}

function getPeers(peerStorageObj){
   var peers = [];

   for(peerUsername in peerStorageObj){
      var peer = peerStorageObj[peerUsername][0];

      peers.push(peer);
   }

   return peers;
}