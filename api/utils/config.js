const gatekeeperAddress = process.env.GATEKEEPER_ADDRESS;
const tokenCapacitorAddress = process.env.TOKEN_CAPACITOR_ADDRESS;
const parameterStoreAddress = process.env.PARAMETER_STORE_ADDRESS;

const rpcEndpoint = process.env.RPC_ENDPOINT || 'http://localhost:8545';

module.exports = {
  contracts: {
    gatekeeperAddress,
    tokenCapacitorAddress,
    parameterStoreAddress,
    genesisBlockNumbers: {
      4: 4555351,
    },
  },
  rpcEndpoint,
};
