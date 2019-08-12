/* eslint-env mocha */
/* global assert artifacts contract */
const utils = require('../utils');

const ParameterStore = artifacts.require('ParameterStore');
const BasicToken = artifacts.require('BasicToken');
const TimeTravelingGatekeeper = artifacts.require('TimeTravelingGatekeeper');

const {
  expectRevert,
  expectErrorLike,
  BN,
  abiCoder,
  timing,
  getResource,
} = utils;

const { increaseTime } = utils.evm;
const { ONE_WEEK } = timing;

contract('TimeTravelGatekeeper', (accounts) => {
  const [creator] = accounts;
  let token;
  let parameters;
  let gatekeeper;
  let GRANT;

  before(async () => {
    const stakeAmount = '5000';
    token = await BasicToken.deployed();

    parameters = await ParameterStore.new(
      ['slateStakeAmount'],
      [abiCoder.encode(['uint256'], [stakeAmount])],
      { from: creator },
    );
    await parameters.init({ from: creator });
  });

  beforeEach(async () => {
    const firstEpochTime = new Date();
    const startTime = Math.floor(firstEpochTime / 1000);

    gatekeeper = await TimeTravelingGatekeeper.new(
      startTime,
      parameters.address,
      token.address,
      { from: creator },
    );

    GRANT = await getResource(gatekeeper, 'GRANT');
  });

  describe('timeTravel', () => {
    const [, alice] = accounts;
    let snapshotID;
    const getTime = () => Math.floor((new Date()).getTime() / 1000);

    beforeEach(async () => {
      snapshotID = await utils.evm.snapshot();
    });

    it('should go forward in time', async () => {
      const now = getTime();
      const initialTime = await utils.epochTime(gatekeeper, now, 'seconds');

      // Go forward
      const timeJump = ONE_WEEK;
      const receipt = await gatekeeper.timeTravel(timeJump, { from: creator });
      const { amount } = receipt.logs[0].args;
      assert.strictEqual(amount.toString(), timeJump.toString(), 'Emitted time jump was wrong');

      const finalTime = await utils.epochTime(gatekeeper, now, 'seconds');
      assert(finalTime > initialTime, 'Should have moved forward in time');
      const expectedTime = new BN(initialTime).add(timeJump);
      assert.strictEqual(finalTime.toString(), expectedTime.toString());
    });

    it('should go backward in time', async () => {
      // Go forward into the epoch
      const offset = ONE_WEEK.mul(new BN(10));
      await increaseTime(offset);

      // Get the initial timings
      const now = getTime();
      const initialTime = await utils.epochTime(gatekeeper, now, 'seconds');

      // Now go back again
      const timeJump = ONE_WEEK.neg();
      const receipt = await gatekeeper.timeTravel(timeJump, { from: creator });
      const { amount } = receipt.logs[0].args;
      assert.strictEqual(amount.toString(), timeJump.toString(), 'Emitted time jump was wrong');

      const finalTime = await utils.epochTime(gatekeeper, now, 'seconds');
      assert(finalTime < initialTime, 'Should have moved backward in time');
      const expectedTime = new BN(initialTime).add(timeJump);
      assert.strictEqual(finalTime.toString(), expectedTime.toString());
    });

    it('should revert if someone other than the owner tries to time travel', async () => {
      try {
        await gatekeeper.timeTravel(ONE_WEEK, { from: alice });
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'Only the owner');
        return;
      }
      assert.fail('Allowed someone other than the owner to time travel');
    });

    it('should go back before a deadline', async () => {
      const resource = GRANT;
      // move forward to after the deadline
      const epochNumber = await gatekeeper.currentEpochNumber();
      const deadline = await gatekeeper.slateSubmissionDeadline(epochNumber, resource);
      const offset = ONE_WEEK.mul(new BN(6));

      await increaseTime(offset);
      const now = await utils.evm.timestamp();
      const submissionTime = new BN(now);
      assert(submissionTime.gt(deadline), 'Time is not after deadline');

      const metadataHash = utils.createMultihash('some slate');
      // Should not let submission
      try {
        await gatekeeper.recommendSlate(resource, [], utils.asBytes(metadataHash), {
          from: alice,
        });
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'Submission period not active');
      }

      // time travel
      await gatekeeper.timeTravel(ONE_WEEK.neg(), { from: creator });

      // Should now be able to submit
      await gatekeeper.recommendSlate(resource, [], utils.asBytes(metadataHash), {
        from: alice,
      });
    });

    afterEach(async () => {
      await utils.evm.revert(snapshotID);
    });
  });
});
