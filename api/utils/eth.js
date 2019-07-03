const ethers = require('ethers');
const config = require('./config');
const { rpcEndpoint } = config;
const { gatekeeperAddress, tokenCapacitorAddress, parameterStoreAddress } = config.contracts;

const {
  contractABIs: { Gatekeeper, TokenCapacitor, ParameterStore },
} = require('../../packages/panvala-utils');

/**
 * Check connection
 */
function checkConnection() {
  // console.log('Connecting to', rpcEndpoint);
  const provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);

  return provider.getBlockNumber();
}

function getContracts() {
  const provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);
  const gatekeeper = new ethers.Contract(gatekeeperAddress, Gatekeeper.abi, provider);
  const tokenCapacitor = new ethers.Contract(tokenCapacitorAddress, TokenCapacitor.abi, provider);

  return {
    provider,
    gatekeeper,
    tokenCapacitor,
  };
}

class Eth {
  constructor() {
    if (process.env.NODE_ENV !== 'test') {
      this.provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);
      this.gatekeeper = new ethers.Contract(gatekeeperAddress, Gatekeeper.abi, this.provider);
      this.tokenCapacitor = new ethers.Contract(
        tokenCapacitorAddress,
        TokenCapacitor.abi,
        this.provider
      );
      this.parameterStore = new ethers.Contract(
        parameterStoreAddress,
        ParameterStore.abi,
        this.provider
      );
    }
  }

  async getChainId() {
    if (process.env.NODE_ENV !== 'test') {
      const network = await this.provider.getNetwork();
      return network.chainId;
    }
  }
}

module.exports = {
  checkConnection,
  getContracts,
  eth: new Eth(),
};
