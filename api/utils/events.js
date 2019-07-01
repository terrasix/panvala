const ethers = require('ethers');
const { EthEvents } = require('eth-events');
const {
  contractABIs: { Gatekeeper, TokenCapacitor, ParameterStore },
} = require('../../packages/panvala-utils');
const {
  contracts: { gatekeeperAddress, tokenCapacitorAddress, genesisBlockNumbers },
  rpcEndpoint,
} = require('./config');
const { getContracts } = require('../utils/eth');

async function getAllEvents(startBlock) {
  try {
    const { provider, gatekeeper } = getContracts();
    const currentBlockNumber = await provider.getBlockNumber();

    const { chainId } = await provider.getNetwork();
    // check the genesis block numbers to specify the earliest block to search from
    const genesisBlockNumber = genesisBlockNumbers[chainId] || 1;
    console.log('startBlock:', startBlock);
    console.log('genesis blockNumber:', genesisBlockNumber);
    console.log('current blockNumber:', currentBlockNumber);

    const psAddress = await gatekeeper.parameters();

    const contracts = [
      {
        abi: Gatekeeper.abi,
        address: gatekeeperAddress,
        name: 'Gatekeeper',
      },
      {
        abi: TokenCapacitor.abi,
        address: tokenCapacitorAddress,
        name: 'Token Capacitor',
      },
      {
        abi: ParameterStore.abi,
        address: psAddress,
        name: 'Parameter Store',
      },
    ];

    const extraneousEventNames = [
      'PermissionRequested',
      // 'VotingTokensDeposited',
      // 'VotingTokensWithdrawn',
    ];
    const ethEvents = EthEvents(contracts, rpcEndpoint, genesisBlockNumber, extraneousEventNames);

    // if it doesn't exist, start at genesisBlock
    const fromBlock = !!startBlock
      ? ethers.utils.bigNumberify(startBlock).toNumber()
      : genesisBlockNumber;

    return ethEvents.getEvents(fromBlock);
  } catch (error) {
    throw error;
  }
}

module.exports = {
  getAllEvents,
};
