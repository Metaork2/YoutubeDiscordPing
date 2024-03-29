//NodeJS Required Modules
var http = require("http");
var https = require("https");

//Definitions

const Quota = 10000;
const { discord,settings } = require('./config.json');

var CurrentUsage = 0;
var LatestVideoId = [];
var channelIcon = [];
var uploadsPlaylist = [];
var state = "starting";
var firstrun = 0;


//Initialization - Grab channel icons of configured channels    
async function initialize(){
    for (i=0;i<settings.YoutubeChannelId.length;i++){
        response = await fetch(`https://youtube.googleapis.com/youtube/v3/channels?part=snippet&part=contentDetails&id=${settings.YoutubeChannelId[i]}&key=${settings.YoutubeAPIKey}`)
        if (response.ok){
            json = await response.json().then( json=>{
                channelIcon[settings.YoutubeChannelId[i]] = { "large": json.items[0].snippet.thumbnails.medium, "default": json.items[0].snippet.thumbnails.default };
                uploadsPlaylist[settings.YoutubeChannelId[i]] = json.items[0].contentDetails.relatedPlaylists.uploads;
                state = "ready";
            });
        }  else{
            console.log(`Initialization Error: ${response.status} - ${response.statusText}`);
        }  
    }

    console.log(`Please ensure bot has permission to access and message in the configured discord server channel.\n Use the following link to "invite" the bot to your server https://discord.com/oauth2/authorize?client_id=${discord.clientid}&permissions=${discord.scopes}&scope=bot`)
}

/*
createDisordPing(array)
Filters video objects based on channel configuration, formats discord rich content embedding & pushes message to discord
inputs: Array of Video Objectss
Outputs:NULL
*/
async function createDiscordPing(videos){
    for (i=0;i<videos.length;i++){
        videoObject = videos[i];
        console.log(videoObject);
        if (settings.channelContentFilter[videoObject.channelId] !== "all"){
            if (settings.channelContentFilter[videoObject.channelId] !== videoObject.contentType){
                return;
            }
        }
        //Bot requires no rich presence, ability to read or respond to messages - therefore discord's basic HTTP api can be used to simplify app
        var $embed = [
                {
                "type": "rich",
                "title": `${videoObject.videoTitle}`,
                "description": `${videoObject.channelName} published a new YouTube video!`,
                "color": 0xff0000,
                "fields": [
                    {
                    "name": `Description`,
                    "value": `${videoObject.description.substr(0,10)}...`,
                    "inline": true
                    }
                ],
                "image": {
                    "url": `${videoObject.thumbnail}`,
                    "height": 0,
                    "width": 0
                },
                "thumbnail": {
                    "url": `${channelIcon[videoObject.channelId].large.url}`,
                    "height": 0,
                    "width": 0
                },
                "author": {
                    "name": `${videoObject.channelName}`,
                    "url": `https://youtube.com/channel/${videoObject.channelId}`,
                    "icon_url": `${channelIcon[videoObject.channelId].default.url}`
                },
                "url": `https://youtube.com/watch?v=${videoObject.videoId}`
                }
            ]
            $pings ="";
            if (discord.pingEveryone == true){$pings += "@everyone"}
            for (j=0;j<discord.pingroles.length;j++){
                $pings += `<@&${discord.pingroles[j]}>`
            }
        var $textMessage = `${$pings} ${videoObject.channelName} just uploaded ${videoObject.videoTitle} at https://youtube.com/watch?v=${videoObject.videoId} ! Remember to share and like and SMASH THAT BELL to keep the channel afloat!`
        //POST {$discord.api.base}/channels/{$discord.channelid}/messages
        var $req = (`${discord.api.base}/channels/${discord.channelid}/messages`);
        var $opts = {
            'method': "POST",
            'headers':{"Authorization": `${discord.api.auth} ${discord.api.token}`,"content-type": "application/json"},
            'body': JSON.stringify({
                'content': $textMessage,
                'tts': false,
                'embeds': $embed
            })
        }
        response = await fetch($req,$opts)
        if (response){
            json = await response.json();
            console.log("Discord Ping Successful");
        }
        if (response.errors){
            console.log(response.errors);
        }
    }
}

/*
interp(array)
Forms an array to pass to discord to create pings using
inputs: Array of Youtube Video Object
Outputs:Array of objects containing necesarry infomration about most recent videos
*/
function interp(a){
    var output = [];
    if (typeof(a) === "undefined"){return;}else{
        a.forEach(e =>{
            var thisOutput = [];
            thisOutput.channelName = e.snippet.channelTitle;
            thisOutput.channelId = e.snippet.channelId;
            thisOutput.videoTitle = e.snippet.title;
            thisOutput.description = e.snippet.description;
            thisOutput.thumbnail = e.snippet.thumbnails.maxres.url;
            thisOutput.contentType = ((e.contentDetails.duration.split("PT")[1].split("S")[0]<59) ? "YoutubeShort" : "FullLength")
            thisOutput.publishedAt = e.snippet.publishedAt;
            thisOutput.videoId = e.id
            output.push(thisOutput);
        })
    }
    if (firstrun<settings.YoutubeChannelId.length){ //Dont ping on first run for each channel
		
		firstrun++;
		console.log(firstrun);
		console.log(firstrun<settings.YoutubeChannelId.length)
        state = "ready"
        return;
    }else{
        createDiscordPing(output);
        console.log("Latest Video ID's: "+LatestVideoId)
        state = "ready"
    }
}

/*
grabVideoData(array)
Interrogates the Youtube API to retreive detailed information relating to the video IDs supplied
inputs: Array of Youtube Video IDs
Outputs:Array of Youtube Video Objects
*/
async function grabVideoData(a){
    if (a.length < 1){return;}else{
    queryString = '';
    a.forEach(e=>{queryString += "&id="+e});
        response = await fetch('https://youtube.googleapis.com/youtube/v3/videos?part=snippet&part=contentDetails'+queryString+'&key='+settings.YoutubeAPIKey,{'method': "GET"});
        if (response.ok){
            json = await response.json();   
            return Promise.resolve(json.items);
        }    
    }
}

/*
grabVideoData(int)
Searches Youtube for the 5 most recent videos PUBLISHED by the channel ID in the supplied position of the channel ID array
inputs: Interger position of channel ID within constant array
Outputs: array of Youtube video IDs
*/
async function grabLatestVideos(selector){
    console.log('https://youtube.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId='+uploadsPlaylist[settings.YoutubeChannelId[selector]]+'&key='+settings.YoutubeAPIKey);
    response = await fetch('https://youtube.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId='+uploadsPlaylist[settings.YoutubeChannelId[selector]]+'&key='+settings.YoutubeAPIKey,{'method': "GET"});
    if (response.ok){
        json = await response.json();
        validVideos = [];
        for (i=0;i<json.items.length;i++){
            if(LatestVideoId[selector] == json.items[i].contentDetails.videoId){
                i=6;
            }else{
              validVideos.push(json.items[i].contentDetails.videoId);
            }
        }
        if (validVideos.length >=1){
            LatestVideoId[selector] = validVideos[0];
           videoData =  await grabVideoData(validVideos);
           await interp(videoData);
           console.log(`Scheduling next detection run for ${new Date(Date.now()+(settings.scanInterval*60*1000)).toTimeString()}`);
        }else{
            console.log(`no new videos found, scheduling next detection run for ${new Date(Date.now()+(settings.scanInterval*60*1000)).toTimeString()}`);
            state = "ready"
        }
    }else{

        console.log(`An Error has occurred, scheduling next detection run for ${new Date(Date.now()+(settings.scanInterval*60*1000)).toTimeString()}`)
        json = await response.json();
        console.log(json.error.message);
    }
}  

//Repeatedly (15 minutes intervals? depending on youtube quota) check for new uploads, then determine content type
function loop(){
    console.log("Checking for new videos");
    if (state == "updating" || state == "starting"){return false;} //Dont attempt to refresh if we're alreaday trying to
    var state ="updating"
    videoData = [];
    for (i=0;i<settings.YoutubeChannelId.length;i++){
        grabLatestVideos(i);
    }
}

initialize();
setTimeout(loop,5000); // Run first detection after 5 seconds -- this detection cycle WONT produce a ping, but grabs all currently published videos


var startedAt = (new Date.now())

delta = (((Math.ceil((startedAt.getMinutes())/settings.scanInterval))*settings.scanInterval)-startedAt.getMinutes());

console.log(`Time Delta To Next Requested Scan ${delta}, delaying interval creation`)


setTimeout(function(){setInterval(loop,(settings.scanInterval*60*1000))},((delta*1000)-startedAt.getSeconds()));