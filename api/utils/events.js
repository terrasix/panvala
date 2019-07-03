const { EthEvents } = require('eth-events');
const {
  contractABIs: { Gatekeeper, TokenCapacitor, ParameterStore },
} = require('../../packages/panvala-utils');
const {
  contracts: { genesisBlockNumbers },
  rpcEndpoint,
} = require('./config');
const { eth } = require('./eth');

let ethEvents;

async function setupEthEvents() {
  const { gatekeeper, tokenCapacitor, parameterStore } = eth;
  const { chainId } = await eth.getChainId();
  // check the genesis block numbers to specify the earliest block to search from
  const genesisBlockNumber = genesisBlockNumbers[chainId] || 1;

  const contracts = [
    {
      abi: Gatekeeper.abi,
      address: gatekeeper.address,
      name: 'Gatekeeper',
    },
    {
      abi: TokenCapacitor.abi,
      address: tokenCapacitor.address,
      name: 'Token Capacitor',
    },
    {
      abi: ParameterStore.abi,
      address: parameterStore.address,
      name: 'Parameter Store',
    },
  ];

  const extraneousEventNames = ['VotingTokensDeposited', 'VotingTokensWithdrawn'];
  ethEvents = EthEvents(contracts, rpcEndpoint, genesisBlockNumber, extraneousEventNames);
}

async function getEthEvents(fromBlock, toBlock) {
  try {
    if (!ethEvents) {
      await setupEthEvents();
    }
    const { chainId } = await eth.getChainId();
    if (chainId === 4) {
      return [];
    }

    console.log();
    console.log(`getting eth-events from ${fromBlock} to ${toBlock}`);
    return ethEvents.getEvents(fromBlock, toBlock);
  } catch (error) {
    console.log('ERROR while getting eth-events:', error.message);
    throw error;
  }
}

module.exports = {
  setupEthEvents,
  getEthEvents,
};
