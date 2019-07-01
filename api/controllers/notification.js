const { utils } = require('ethers');
const { getNormalizedNotificationsByEvents } = require('../utils/notifications');
const event = require('../controllers/event');

const numRegex = /^([^0-9]*)$/;

module.exports = {
  /**
   * Get all notifications for a user's address
   */
  getByAddress(req, res) {
    const { address } = req.params;

    try {
      utils.getAddress(address);
    } catch (error) {
      res.status(400).send(`Invalid address provided in body: ${error}`);
    }

    try {
      // this uses cached transactions
      event.getAll().then(events => {
        // get normalize events by address
        getNormalizedNotificationsByEvents(events, address).then(notifications => {
          // console.log('notifications:', notifications);
          res.json(notifications);
        });
      });
    } catch (error) {
      res.status(400).send('ERROR while getting notifications by address:', error);
    }
  },
};
