const express = require('express');
const cors = require('cors');
const setupRoutes = require('./routes');
const morgan = require('morgan');
const { setupBlockTracker } = require('./utils/blockTracker.js');
const { setupEthEvents } = require('./utils/events.js');

const app = express();

// Configuration and middleware:
const port = process.env.PORT || 5000;
// enable ALL CORS requests
// see: https://github.com/expressjs/cors#simple-usage-enable-all-cors-requests
app.use(cors({ credentials: true, origin: true }));
// enable parsing of JSON in POST request bodies
app.use(express.json());
// add logging
app.use(morgan('common'));

// Routes:
setupRoutes(app);

// Init eth-events
setupEthEvents();

// Init block tracker
setupBlockTracker();

// Start server:
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`Starting server on port ${port}...`));
}

module.exports = app;
