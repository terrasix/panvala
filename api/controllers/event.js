const { utils } = require('ethers');
const sortBy = require('lodash/sortBy');
const { Event } = require('../models');
const { getEthEvents } = require('../utils/events');

const { bigNumberify: BN } = utils;
const numRegex = /^([^0-9]*)$/;

module.exports = {
  // get all rows from the events table
  async getAll(req, res) {
    return Event.findAll({ raw: true }).then(events => {
      if (!!req && !!res) {
        // normal get request
        return res.send(events);
      }
      // caller is another controller
      console.log(events.length, 'events returned to caller');
      return events;
    });
  },

  // get recent transactions/events and add/sync them to the events table
  async syncEvents(startBlock) {
    // use the greatest block number from the events table as
    // the first block when querying for a range of recent txs
    return Event.max('blockNumber').then(async cachedBlockNumber => {
      if (startBlock === cachedBlockNumber) {
        return;
      }
      if (startBlock && cachedBlockNumber && BN(startBlock).lt(cachedBlockNumber)) {
        startBlock = cachedBlockNumber;
      } else if (!startBlock && cachedBlockNumber) {
        startBlock = cachedBlockNumber;
      }

      const events = await getEthEvents(startBlock);
      console.log('');
      console.log('events:', events.length);

      // sort by timestamp
      const ordered = sortBy(events, 'timestamp');

      // sequentially add to db by block.timestamp
      for (let i = 0; i < ordered.length; i++) {
        const {
          txHash,
          timestamp,
          blockNumber,
          sender,
          recipient,
          values,
          name,
          logIndex,
        } = ordered[i];

        const emittedValues = Object.keys(values).reduce((acc, arg) => {
          let value = values[arg];
          // filter out numerical duplicates, like { 0: '0x1234', voter: '0x1234' }, and the `length` field
          if (numRegex.test(arg) && arg !== 'length') {
            if (value.hasOwnProperty('_hex')) {
              // convert ethers.js BigNumber -> string
              value = value.toString();
            }
            return {
              ...acc,
              [arg]: value,
            };
          }
          return acc;
        }, []);

        // add or re-write a row on the events table
        await Event.findOrCreate({
          where: { txHash, name, logIndex },
          defaults: {
            txHash,
            timestamp,
            blockNumber,
            sender,
            recipient,
            name,
            logIndex,
            values: emittedValues,
          },
        });
      }
      return Event.findAll();
    });
  },
};
