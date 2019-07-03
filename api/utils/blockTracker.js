const { syncEvents } = require('../controllers/event');
const { Event } = require('../models');
const {
  contracts: { genesisBlockNumbers },
} = require('./config');
const { eth } = require('./eth');

async function setupBlockTracker() {
  try {
    const { provider } = eth;
    const chainId = await eth.getChainId();
    const genesisBlock = genesisBlockNumbers[chainId] || 1;

    Event.max('blockNumber').then(async cachedBlockNumber => {
      let startBlock;
      if (cachedBlockNumber) {
        // sync from the greatest cached block number
        console.log('syncing blocks after cache');
        startBlock = cachedBlockNumber;
      } else {
        // sync from the genesis block (of the contracts)
        console.log('syncing blocks from genesis block');
        startBlock = genesisBlock;
      }

      await syncEvents(startBlock);

      // on every new block, sync the events table in the db
      provider.on('block', blockNumber => {
        console.log();
        console.log('NEW BLOCK:', blockNumber);
        syncEvents(blockNumber);
      });
    });
  } catch (error) {
    console.log('ERROR in block tracker:', error);
    // throw error;
  }
}

module.exports = {
  setupBlockTracker,
};
