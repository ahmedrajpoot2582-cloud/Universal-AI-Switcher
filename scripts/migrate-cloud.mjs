import {store} from '../server/cloud-store.js';
await store().migrate();console.log('Private connection-link and history tables ready. Existing account data preserved.');
