//NodeJS Required Modules
var http = require("http");
var https = require("https");

//Definitions

const Quota = 10000;
const { discord,settings } = require('./config.json');

var CurrentUsage = 0;
var LatestVideoId = [];
var channelIcon = [];
var state = "starting";


//Initialization - Grab channel icons of configured channels    
async function initialize(){

    for (i=0;i<settings.YoutubeChannelId.length;i++){


        response = await fetch(`https://youtube.googleapis.com/youtube/v3/channels?part=snippet&id=${settings.YoutubeChannelId[i]}&key=${settings.YoutubeAPI}`)

        if (response.ok){
            json = await response.json();   

                channelIcon[settings.YoutubeChannelId[i]] = { "large": json.items[0].snippet.thumbnails.medium, "default": json.items[0].snippet.thumbnails.default };


            state = "ready";
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

    console.log(videos);

    for (i=0;i<videos.length;i++){

        videoObject = videos[i];

        console.log(videoObject);
        
        //ToDo: Per channel filtering (i.e shorts only or not, ignore vidoes without tags)


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
            
        var $textMessage = "@everyone Check out the latest youtube video"
        
        //POST {$discord.api.base}/channels/{$discord.channelid}/messages
        var $req = (`${discord.api.base}/channels/${discord.channelid}/messages`);
        var $opts = {
            'method': "POST",
            'headers':{"Authorization": `${discord.api.auth} ${discord.api.token}`,"content-type": "application/json"},
            'body': JSON.stringify({
                'content': $textMessage,
                'tts': false,
                'embeds': $embed,
                'allowed_mentions': {
                    "parse":["everyone"]
                }
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

    createDiscordPing(output);
    console.log("Videos in buffer:");
  //  console.log(output);
    console.log("Latest Video ID's: "+LatestVideoId)
    state = "ready"
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
        response = await fetch('https://youtube.googleapis.com/youtube/v3/videos?part=snippet&part=contentDetails'+queryString+'&key='+settings.YoutubeAPI,{'method': "GET"});
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
    response = await fetch('https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId='+settings.YoutubeChannelId[selector]+'&order=date&key='+settings.YoutubeAPI,{'method': "GET"});
    if (response.ok){
        json = await response.json();
        validVideos = [];
        for (i=0;i<json.items.length;i++){
            if(LatestVideoId[selector] == json.items[i].id.videoId){
                i=6;
            }else{
              validVideos.push(json.items[i].id.videoId);
            }
        }
        if (validVideos.length >=1){
            LatestVideoId[selector] = validVideos[0];
           videoData =  await grabVideoData(validVideos);
           await interp(videoData);
        }else{
            state = "ready"
        }
    }
}  





//Repeatedly (5 minutes intervals? depending on youtube quota) check for new uploads, then determine content type
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
//loop();
setInterval(loop,3000);
