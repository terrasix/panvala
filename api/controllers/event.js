const { utils } = require('ethers');
const { Event } = require('../models');
const { getAllEvents } = require('../utils/events');
const numRegex = /^([^0-9]*)$/;
const BN = small => utils.bigNumberify(small);

module.exports = {
  async getAll(req, res) {
    return Event.findAll().then(transactions => {
      const events = transactions.map(t => {
        // t.values is a JSON blob in sql
        t.values = JSON.parse(t.values);
        return t;
      });
      if (!!req && !!res) {
        // normal get request
        return res.send(events);
      }
      // caller is another controller
      console.log(events.length, 'events returned to caller');
      return events;
    });
  },

  async syncEvents() {
    return Event.max('blockNumber').then(async cachedBlockNumber => {
      const events = await getAllEvents(cachedBlockNumber);

      const txs = await Promise.all(
        events.map(event => {
          const { txHash, timestamp, blockNumber, sender, recipient, values, name } = event;
          // print out event name and block.timestamp
          // console.log(name, timestamp);
          // parse values, and print out event values for debugging
          const vals = Object.keys(values).reduce((acc, arg) => {
            let value = values[arg];
            // filter out numerical duplicates, like { 0: '0x1234', voter: '0x1234' }, and the `length` field
            if (numRegex.test(arg) && arg !== 'length') {
              if (value.hasOwnProperty('_hex')) {
                value = value.toString();
              }
              // print out event values for debugging
              // console.log(arg, value);
              return {
                ...acc,
                [arg]: value,
              };
            }
            return acc;
          }, []);

          // create or re-write db cache
          return Event.findOrCreate({
            where: { txHash },
            defaults: {
              txHash,
              timestamp,
              blockNumber,
              sender,
              recipient,
              name,
              values: JSON.stringify(vals),
            },
          });
        })
      );
      console.log('');
      console.log('txs:', txs.length);
      return txs;
    });
  },
};
