import request from 'request-promise';

export default async function albumLoader(token, albumID){

    const apiEndpoint = 'https://photoslibrary.googleapis.com';

    const result = await request.post(apiEndpoint + '/v1/mediaItems:search', {
        headers: {'Content-Type': 'application/json'},
        json: { "albumId": albumID, "pageSize": 50} ,
        auth: {'bearer': token},
    });
      
    return result
}