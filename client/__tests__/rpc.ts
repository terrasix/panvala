import ganache from 'ganache-core';
import { providers, ethers } from 'ethers';
import { contractABIs } from '../../packages/panvala-utils';

const gatekeeperAddress = process.env.GATEKEEPER_ADDRESS;
const tokenCapacitorAddress = process.env.TOKEN_CAPACITOR_ADDRESS;
const parameterStoreAddress = process.env.PARAMETER_STORE_ADDRESS;

function Eth() {
  let provider, gatekeeper, tokenCapacitor, parameterStore;

  if (process.env.NODE_ENV === 'test') {
    const options = {
      mnemonic: process.env.MNEMONIC,
      port: 7545,
      network_id: 420,
      locked: false,
      unlocked_accounts: [0, 1, 2, 3, 4],
    };
    const { TimeTravelingGatekeeper, TokenCapacitor, ParameterStore } = contractABIs;

    provider = new providers.Web3Provider(ganache.provider(options));
    // gatekeeper = new ethers.Contract(gatekeeperAddress, TimeTravelingGatekeeper.abi, provider);
    // tokenCapacitor = new ethers.Contract(tokenCapacitorAddress, TokenCapacitor.abi, provider);
    // parameterStore = new ethers.Contract(parameterStoreAddress, ParameterStore.abi, provider);
  }

  async function getChainId() {
    if (process.env.NODE_ENV !== 'test') {
      const network = await provider.getNetwork();
      return network.chainId;
    }
  }

  return Object.freeze({
    getChainId,
    provider,
    // gatekeeper,
    // tokenCapacitor,
    // parameterStore,
  });
}

export default Eth();
