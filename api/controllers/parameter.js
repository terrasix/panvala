const ethers = require('ethers');
const { Event } = require('../models');
const { eth } = require('../utils/eth');
const {
  contractABIs: { ParameterStore },
} = require('../../packages/panvala-utils');

module.exports = {
  async getAll(req, res) {
    const { gatekeeper, provider } = eth;

    // get the parameter store associated with the gatekeeper
    const psAddress = await gatekeeper.functions.parameters();
    const parameterStore = new ethers.Contract(psAddress, ParameterStore.abi, provider);

    // get directly from contract
    const slateStakeAmount = (await parameterStore.getAsUint('slateStakeAmount')).toString();

    // get ParameterInitialized events from db cache
    const parameterInitializedEvents = await Event.findAll({
      where: {
        name: 'ParameterInitialized',
      },
      raw: true,
    });

    // Array -> Object w/ just the keys and values
    const params = parameterInitializedEvents.reduce((acc, val) => {
      const values = JSON.parse(val.values);
      // TODO: change to [values.name]
      return {
        [values.key]: values.value,
        ...acc,
      };
    }, {});
    console.log('params:', params);

    const parameters = {
      slateStakeAmount,
      gatekeeperAddress: gatekeeper.address,
      ...params,
    };

    res.send(JSON.stringify(parameters));
  },
};
