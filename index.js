// Importing node functions
import { readFile, unlinkSync } from 'fs';
import { promisify } from 'util';

// Importing social media packages
import {google} from 'googleapis'
import Photos from 'googlephotos'
import { IgApiClient } from 'instagram-private-api';

// Import misc node packages
import dotenv from 'dotenv'
import storage from 'node-persist'
import refresh from 'google-refresh-token'

// Import helper functions
import askQuestion from './helper/askQuestion.js'
import download from './helper/download.js'
import shuffle from './helper/shuffle.js'

// Setup use of .env file
dotenv.config();

// Convert readFile to async function
const readFileAsync = promisify(readFile);

// Define scope of access for Google API
const scopes = [Photos.Scopes.READ_AND_APPEND];

// Instantiate Instagram API
const ig = new IgApiClient();

// Definition of login function
async function login() {
  ig.state.generateDevice(process.env.IG_USERNAME);
  await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
}

// Initialize Storage
await storage.init({
  dir: './data'
});

// Instantiate authentication clietn
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Get URL to autenticate
const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes
});

// Allow user to authenticate and provide code
console.log("Authenticate Here: ", url, "\n")
const ans = await askQuestion("Enter the auth code: ");
console.log("\n")

// Get tokens and set credentials for oauth
const {tokens} = await oauth2Client.getToken(ans); 
let access_token_main = tokens.access_token;

oauth2Client.setCredentials(tokens);


// Using setInterval to keep OAuth validated and post every 12 hours
const ms_in_hour = 3600000
const hour_interval = 12 * ms_in_hour
const oauth_interval = 0.5 * ms_in_hour
const post_now = hour_interval / oauth_interval
let counter = 0

setInterval(async () => {
  if(counter === post_now){
      console.log("Posting Image...\n")

      // Instantiate Google Photos client
      let photos = new Photos(access_token_main);

      // Fetch the images from the album
      let response = await photos.mediaItems.search(process.env.FINSTA_ALBUM_ID);

      // Variable to keep track of if an image is posted on this loop
      let uploaded = false;
      console.log("-----\n")

      // Shuffle list of images so post is random
      let images_ = shuffle(response.mediaItems)

      // Loop over images fetched
      for (let image of images_) {

        // If image has been uploaded then break out of loop
        if(uploaded) { break; }

        // Fetch image ID from data storage
        let t = await storage.getItem(image.id);

        // If image has not been uploaded proceed inside if statement
        if(typeof t === "undefined"){
          
          // Get parameters for post
          let url = image.baseUrl
          let caption = image.description

          // Get parameters for saving file
          let extension = image.filename.split(".")[1]
          let path  = './temp/file.' + extension

          // Download the image and save it in temp
          await download(url, path, function(){
            console.log('Downloaded Image - ', image.filename);
          });

          // Login to instagram account
          await login();

          // Upload the image with caption
          const publishResult = await ig.publish.photo({
            
            file: await readFileAsync(path),
            
            caption: caption,
          });

          console.log("Attempted to post - ", image.filename, " | Status is ", publishResult.status);

          // Delete the downloaded image
          await unlinkSync(path, (err) => {
              if(err) return console.log("Error when removing file = '", err);
          })
          
          // Save a permanent file in data folder with image id to keept track that its been uploaded
          await storage.setItem(image.id, true)

          // Set uploaded to true
          uploaded = true;
          console.log("-----\n")
        }
      }

      counter = 0
  }else{
      console.log("Validating credentials...\n")

      refresh(tokens.refresh_token, process.env.CLIENT_ID, process.env.CLIENT_SECRET, function (err, json, res) {
        if (err) return handleError(err);
        if (json.error) return handleError(new Error(res.statusCode + ': ' + json.error));
       
        access_token_main = json.accessToken;
        if (! access_token_main) {
          return handleError(new Error(res.statusCode + ': refreshToken error'));
        }

        console.log("Current Access Token = ", access_token_main);
        oauth2Client.setCredentials(json);
        
      });

      // Instantiate Google Photos client
      let photos = new Photos(access_token_main);

      // Fetch the images from the album
      let response = await photos.mediaItems.search(process.env.FINSTA_ALBUM_ID);

      console.log("Image Array Length = ", response.mediaItems.length)

      counter += 1;
  }
  
}, oauth_interval)