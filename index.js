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
import { ToadScheduler, SimpleIntervalJob, Task } from 'toad-scheduler'

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

// Scheduling requirements for posts
const scheduler = new ToadScheduler()


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
oauth2Client.setCredentials(tokens);

// Schedule job as per rules
const task = new Task(
  'Uploading Image',

  async () => {

    // Instantiate Google Photos client
    const photos = new Photos(tokens.access_token);

    // Fetch the images from the album
    const response = await photos.mediaItems.search(process.env.FINSTA_ALBUM_ID);

    // Variable to keep track of if an image is posted on this loop
    let uploaded = false;
    console.log("-----\n")

    // Shuffle list of images so post is random
    const images_ = shuffle(response.mediaItems)

    // Loop over images fetched
    for (const image of images_) {

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
  }
)  

// Create and run job
const job = new SimpleIntervalJob({ hours: 10, }, task)
scheduler.addSimpleIntervalJob(job)