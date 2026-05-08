// File: mobile/src/api/client.js
import axios from 'axios';

// Replace the IP below with your actual IPv4 address
export const IP_ADDRESS = '10.92.188.3'; 

// export const IP_ADDRESS = '172.20.10.8'; 
export const SERVER_URL = `http://${IP_ADDRESS}:5000`; // Exported so images can use it!

const client = axios.create({
    baseURL: `${SERVER_URL}/api`,
    headers: {
        'Content-Type': 'application/json'
    }
});

export default client;