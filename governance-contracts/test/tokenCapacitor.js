/* eslint-env mocha */
/* global assert artifacts contract */

const utils = require('./utils');

const TokenCapacitor = artifacts.require('TokenCapacitor');
const ParameterStore = artifacts.require('ParameterStore');

const {
  expectRevert,
  expectErrorLike,
  expectEvents,
  voteSingle,
  revealVote,
  grantSlateFromProposals,
  BN,
  timing,
  loadDecayMultipliers,
  toPanBase,
  epochPeriods,
} = utils;

const { increaseTime, goToPeriod } = utils.evm;


contract('TokenCapacitor', (accounts) => {
  const multipliers = loadDecayMultipliers();
  const getMultiplier = days => new BN(multipliers[days]);
  const halfLife = 1456;
  let snapshotID;

  beforeEach(async () => {
    snapshotID = await utils.evm.snapshot();
  });

  afterEach(async () => utils.evm.revert(snapshotID));

  describe('constructor', () => {
    const [creator] = accounts;
    let gatekeeper;
    let parameters;
    let token;
    const initialUnlockedBalance = toPanBase('1000');

    beforeEach(async () => {
      token = await utils.newToken({ from: creator });
      // deploy a gatekeeper
      gatekeeper = await utils.newGatekeeper({ tokenAddress: token.address, from: creator });
      const parametersAddress = await gatekeeper.parameters();
      parameters = await ParameterStore.at(parametersAddress);
    });

    it('should correctly initialize the capacitor', async () => {
      // deploy a new capacitor
      const capacitor = await TokenCapacitor.new(
        parameters.address,
        token.address,
        initialUnlockedBalance,
        {
          from: creator,
        },
      );

      const initialLockedTime = await capacitor.lastLockedTime();

      // ParameterStore was connected
      const connectedParameterStore = await capacitor.parameters();
      assert.strictEqual(connectedParameterStore, parameters.address);

      // Token is set
      const connectedToken = await capacitor.token();
      assert.strictEqual(connectedToken, token.address);

      // no proposals yet
      const proposalCount = await capacitor.proposalCount();
      assert.strictEqual(proposalCount.toString(), '0', 'There should be no proposals yet');

      // check token balances
      const { unlocked, locked } = await utils.capacitorBalances(capacitor);
      assert.strictEqual(unlocked.toString(), initialUnlockedBalance.toString(), 'Wrong unlocked');
      assert.strictEqual(locked.toString(), '0', 'Wrong locked');

      const now = await utils.evm.timestamp();
      const expectedLockedTime = utils.adjustedLockTime(initialLockedTime, new BN(now));
      const lastLockedTime = await capacitor.lastLockedTime();
      assert.strictEqual(lastLockedTime.toString(), expectedLockedTime.toString(), 'Wrong last locked');

      const releasedTokens = await capacitor.lifetimeReleasedTokens();
      assert.strictEqual(releasedTokens.toString(), '0', 'Wrong released');
    });

    it('should fail if the parameter store address is zero', async () => {
      const badParameters = utils.zeroAddress();

      try {
        await TokenCapacitor.new(badParameters, token.address, initialUnlockedBalance, {
          from: creator,
        });
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'parameter store address');
        return;
      }
      assert.fail('Created TokenCapacitor with a zero parameter store address');
    });

    it('should fail if the token address is zero', async () => {
      const badToken = utils.zeroAddress();

      try {
        await TokenCapacitor.new(parameters.address, badToken, initialUnlockedBalance, {
          from: creator,
        });
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'Token address');
        return;
      }
      assert.fail('Created TokenCapacitor with a zero token address');
    });

    it('should fail if the Gatekeeper address is zero', async () => {
      const badParameters = await ParameterStore.new([], [], { from: creator });

      try {
        await TokenCapacitor.new(
          badParameters.address,
          token.address,
          initialUnlockedBalance,
          { from: creator },
        );
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'Gatekeeper address');
        return;
      }
      assert.fail('Created TokenCapacitor with a zero token address');
    });
  });

  describe('createProposal', () => {
    const [creator, beneficiary] = accounts;
    let capacitor;
    let gatekeeper;

    beforeEach(async () => {
      ({ capacitor, gatekeeper } = await utils.newPanvala({ from: creator }));
      await goToPeriod(gatekeeper, epochPeriods.SUBMISSION);
    });

    it('should create a proposal to the appropriate beneficiary', async () => {
      const to = beneficiary;
      const tokens = toPanBase('1000');
      const metadataHash = utils.createMultihash('my request data');

      const receipt = await capacitor.createProposal(
        to,
        tokens,
        utils.asBytes(metadataHash),
        { from: creator },
      );

      const {
        proposalID,
        proposer,
        requestID,
        recipient: emittedRecipient,
        tokens: emittedTokens,
        metadataHash: emittedHash,
      } = receipt.logs[0].args;

      // should emit event with requestID and other data
      assert.strictEqual(proposalID.toString(), '0', 'Emitted wrong proposalID');
      assert.strictEqual(requestID.toString(), '0', 'Emitted wrong requestID');
      assert.strictEqual(proposer, creator, 'Emitted wrong proposer');
      assert.strictEqual(emittedRecipient, to, 'Emitted wrong beneficiary');
      assert.strictEqual(emittedTokens.toString(), tokens, 'Emitted wrong number of tokens');
      assert.strictEqual(
        utils.bytesAsString(emittedHash),
        metadataHash,
        'Emitted wrong metadataHash',
      );

      // should increment proposalCount
      const proposalCount = await capacitor.proposalCount();
      assert.strictEqual(proposalCount.toString(), '1', 'Should have incremented proposalCount');

      // should save proposal with values
      const proposal = await capacitor.proposals(requestID);
      assert.strictEqual(proposal.gatekeeper, gatekeeper.address, 'Proposal has wrong gatekeeper');
      assert.strictEqual(proposal.requestID.toString(), '0', 'Proposal has wrong requestID');
      assert.strictEqual(proposal.tokens.toString(), tokens, 'Proposal has wrong number of tokens');
      assert.strictEqual(proposal.to, to, 'Proposal has wrong beneficiary');
      assert.strictEqual(
        utils.bytesAsString(proposal.metadataHash),
        metadataHash,
        'Proposal has wrong metadataHash',
      );
      // proposal should not be marked as withdrawn
      assert.strictEqual(proposal.withdrawn, false, 'Proposal should not be withdrawn');
    });

    it('should allow a proposal to send to the zero address', async () => {
      const to = utils.zeroAddress();
      const tokens = toPanBase('1000');
      const metadataHash = utils.createMultihash('my request data');

      await capacitor.createProposal(
        to,
        tokens,
        utils.asBytes(metadataHash),
        { from: creator },
      );
    });

    // rejection criteria:
    it('should not allow creation of a proposal with an empty metadataHash', async () => {
      const to = beneficiary;
      const tokens = toPanBase('1000');
      const emptyHash = '';

      try {
        await capacitor.createProposal(
          to,
          tokens,
          utils.asBytes(emptyHash),
          { from: creator },
        );
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'cannot be empty');
        return;
      }
      assert.fail('allowed creation of a proposal with an empty metadataHash');
    });
  });

  describe('createManyProposals', () => {
    const [creator, proposer, beneficiary1, beneficiary2] = accounts;
    let capacitor;
    let gatekeeper;

    beforeEach(async () => {
      ({ capacitor, gatekeeper } = await utils.newPanvala({ from: creator }));
      await goToPeriod(gatekeeper, epochPeriods.SUBMISSION);
    });

    it('should create proposals and emit an event for each', async () => {
      const beneficiaries = [beneficiary1, beneficiary2];
      const tokenAmounts = ['1000', '2000'].map(toPanBase);
      const metadataHashes = ['request1', 'request2'].map(r => utils.createMultihash(r));

      const receipt = await capacitor.createManyProposals(
        beneficiaries,
        tokenAmounts,
        metadataHashes.map(utils.asBytes),
        { from: proposer },
      );

      assert.strictEqual(receipt.logs.length, beneficiaries.length, 'Wrong number of events');

      // eslint-disable-next-line
      for (let i = 0; i < beneficiaries.length; i++) {
        const log = receipt.logs[i];
        const to = beneficiaries[i];
        const tokens = tokenAmounts[i];
        const metadataHash = metadataHashes[i];

        const {
          proposalID,
          proposer: emittedProposer,
          requestID,
          recipient: emittedRecipient,
          tokens: emittedTokens,
          metadataHash: emittedHash,
        } = log.args;

        // should emit event with requestID and other data
        const index = i.toString();
        assert.strictEqual(requestID.toString(), index, 'Emitted wrong requestID');
        assert.strictEqual(proposalID.toString(), index, 'Emitted wrong proposalID');
        assert.strictEqual(emittedProposer, proposer, 'Emitted wrong proposer');
        assert.strictEqual(emittedRecipient, to, 'Emitted wrong beneficiary');
        assert.strictEqual(emittedTokens.toString(), tokens, 'Emitted wrong number of tokens');
        assert.strictEqual(
          utils.bytesAsString(emittedHash),
          metadataHash,
          'Emitted wrong metadataHash',
        );
      }
    });
  });

  describe('withdrawTokens', () => {
    const [creator, recommender1, recommender2, alice, bob, carol] = accounts;

    let gatekeeper;
    let token;
    let capacitor;

    const capacitorSupply = '50000000';
    let epochNumber;

    let proposals1;
    let proposals2;
    let winningSlate;
    let losingSlate;
    let winnerPermissions;
    let loserPermissions;

    beforeEach(async () => {
      ({ gatekeeper, token, capacitor } = await utils.newPanvala({ from: creator }));
      epochNumber = await gatekeeper.currentEpochNumber();
      const GRANT = await utils.getResource(gatekeeper, 'GRANT');

      // Charge the capacitor
      await utils.chargeCapacitor(capacitor, capacitorSupply, token, { from: creator });

      // Allocate tokens
      const allocatedTokens = toPanBase('10000');
      await token.transfer(alice, allocatedTokens, { from: creator });
      await token.transfer(bob, allocatedTokens, { from: creator });
      await token.transfer(carol, allocatedTokens, { from: creator });

      await token.approve(gatekeeper.address, allocatedTokens, { from: alice });
      await token.approve(gatekeeper.address, allocatedTokens, { from: bob });
      await token.approve(gatekeeper.address, allocatedTokens, { from: carol });

      // create simple ballot with just grants
      await goToPeriod(gatekeeper, epochPeriods.SUBMISSION);
      proposals1 = [
        { to: alice, tokens: '1000', metadataHash: utils.createMultihash('grant for Alice') },
        { to: alice, tokens: '1000', metadataHash: utils.createMultihash('another grant for Alice') },
        { to: bob, tokens: '50000000', metadataHash: utils.createMultihash('a really large grant') },
      ];

      winnerPermissions = await grantSlateFromProposals({
        gatekeeper,
        proposals: proposals1,
        capacitor,
        recommender: recommender1,
        metadata: 'slate 1',
      });

      proposals2 = [
        { to: recommender2, tokens: '100000', metadataHash: utils.createMultihash('All to me') },
      ];

      loserPermissions = await grantSlateFromProposals({
        gatekeeper,
        proposals: proposals2,
        capacitor,
        recommender: recommender2,
        metadata: 'slate 2',
      });

      const recommenderTokens = toPanBase('500000');
      await token.transfer(recommender1, recommenderTokens, { from: creator });
      await token.approve(gatekeeper.address, recommenderTokens, { from: recommender1 });
      await token.transfer(recommender2, recommenderTokens, { from: creator });
      await token.approve(gatekeeper.address, recommenderTokens, { from: recommender2 });

      await gatekeeper.stakeTokens(0, { from: recommender1 });
      await gatekeeper.stakeTokens(1, { from: recommender2 });

      // Commit ballots
      await goToPeriod(gatekeeper, epochPeriods.COMMIT);
      const aliceReveal = await voteSingle(gatekeeper, alice, GRANT, 0, 1, '1000', '1234');
      const bobReveal = await voteSingle(gatekeeper, bob, GRANT, 0, 1, '1000', '5678');
      const carolReveal = await voteSingle(gatekeeper, carol, GRANT, 1, 0, '1000', '9012');

      // Reveal all votes
      await increaseTime(timing.COMMIT_PERIOD_LENGTH);
      await revealVote(epochNumber, gatekeeper, aliceReveal);
      await revealVote(epochNumber, gatekeeper, bobReveal);
      await revealVote(epochNumber, gatekeeper, carolReveal);

      // count votes
      await increaseTime(timing.REVEAL_PERIOD_LENGTH);
      await gatekeeper.finalizeContest(epochNumber, GRANT);
      winningSlate = await gatekeeper.getWinningSlate(epochNumber, GRANT);
      losingSlate = new BN('1');
      assert(losingSlate.toString() !== winningSlate.toString());
    });

    it('should send tokens to the appropriate address if the request has been approved', async () => {
      const proposalID = winnerPermissions[0];

      const { to: beneficiary, tokens: amount } = await capacitor.proposals(proposalID);
      const initialBalance = await token.balanceOf(beneficiary);

      // Get the initial balances
      await capacitor.updateBalances();
      const {
        locked: initialLocked,
        unlocked: initialUnlocked,
      } = await utils.capacitorBalances(capacitor);

      // Withdraw
      const receipt = await capacitor.withdrawTokens(proposalID, { from: beneficiary });
      expectEvents(receipt, ['BalancesUpdated', 'TokensWithdrawn']);

      // Check logs
      const {
        proposalID: emittedProposalID,
        to: emittedBeneficiary,
        numTokens: emittedTokens,
      } = receipt.logs[1].args;

      assert.strictEqual(
        emittedProposalID.toString(),
        proposalID.toString(),
        'Emitted wrong proposalID',
      );
      assert.strictEqual(emittedBeneficiary, beneficiary, 'Emitted wrong beneficiary');
      assert.strictEqual(
        emittedTokens.toString(),
        amount.toString(),
        'Emitted wrong number of tokens',
      );

      // beneficiary 1 should have increased balance
      const expectedBalance = initialBalance.add(new BN(amount));
      const finalBalance = await token.balanceOf(beneficiary);
      assert.strictEqual(
        finalBalance.toString(),
        expectedBalance.toString(),
        'Tokens were not transferred',
      );

      // increment the lifetime withdrawals
      const expectedLifetimeTokens = new BN(amount);
      const lifetimeReleasedTokens = await capacitor.lifetimeReleasedTokens();
      assert.strictEqual(
        lifetimeReleasedTokens.toString(),
        expectedLifetimeTokens.toString(),
        'Wrong lifetime released tokens',
      );

      // Should decrease the unlocked tokens and leave the locked tokens unchanged
      const { locked, unlocked } = await utils.capacitorBalances(capacitor);
      const expectedUnlocked = initialUnlocked.sub(new BN(amount));
      assert.strictEqual(
        unlocked.toString(),
        expectedUnlocked.toString(),
        'Unlocked tokens should have decreased',
      );

      assert.strictEqual(
        locked.toString(),
        initialLocked.toString(),
        'Locked tokens should not have changed',
      );
    });

    it('should allow someone other than the grantee to send the tokens', async () => {
      const proposalID = winnerPermissions[0];

      const { to: beneficiary, tokens: amount } = await capacitor.proposals(proposalID);
      const initialBalance = await token.balanceOf(beneficiary);

      // Someone else withdraws the tokens
      const caller = bob;
      assert(caller !== beneficiary, 'Caller was the beneficiary');
      await capacitor.withdrawTokens(proposalID, { from: caller });

      // Beneficiary should have gotten the tokens
      const expectedBalance = initialBalance.add(new BN(amount));
      const finalBalance = await token.balanceOf(beneficiary);
      assert.strictEqual(
        finalBalance.toString(),
        expectedBalance.toString(),
        'Tokens were not transferred',
      );
    });

    it('should not allow multiple withdrawals for the same proposal ID', async () => {
      const proposalID = winnerPermissions[0];
      const { to: beneficiary } = await capacitor.proposals(proposalID);

      // Withdraw tokens
      await capacitor.withdrawTokens(proposalID, { from: beneficiary });

      // Try to withdraw again
      try {
        await capacitor.withdrawTokens(proposalID, { from: beneficiary });
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'already been withdrawn');
        return;
      }
      assert.fail('Allowed multiple withdrawals for the same request ID');
    });

    it('should revert if the proposal has not been approved by the gatekeeper', async () => {
      const proposalID = loserPermissions[0];
      const { to: beneficiary } = await capacitor.proposals(proposalID);

      try {
        await capacitor.withdrawTokens(proposalID, { from: beneficiary });
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'Proposal has not been approved');
        return;
      }
      assert.fail('Allowed withdrawal for a rejected request');
    });

    it('should revert if the proposal ID is invalid', async () => {
      const proposalID = '5000';
      try {
        await capacitor.withdrawTokens(proposalID, { from: alice });
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'Invalid proposalID');
        return;
      }
      assert.fail('Allowed withdrawal for an invalid proposalID');
    });

    it('should revert if the number of tokens requested is greater than the number of unlocked tokens', async () => {
      const proposalID = winnerPermissions[2]; // The large one

      try {
        await capacitor.withdrawTokens(proposalID, { from: bob });
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'insufficient');
        return;
      }
      assert.fail('Allowed withdrawal of more tokens than have been unlocked');
    });
  });

  describe('donate', () => {
    const [creator, payer, donor] = accounts;
    // let gatekeeper;
    let token;
    let capacitor;

    const capacitorSupply = '50000000';

    beforeEach(async () => {
      ({ token, capacitor } = await utils.newPanvala({ from: creator }));

      // Charge the capacitor
      await utils.chargeCapacitor(capacitor, capacitorSupply, token, { from: creator });

      // Allocate tokens
      const allocatedTokens = toPanBase('1000');
      await token.transfer(payer, allocatedTokens, { from: creator });
      await token.approve(capacitor.address, allocatedTokens, { from: payer });
    });

    it('should let a payer donate tokens', async () => {
      const selfDonor = payer;
      const numTokens = toPanBase('100');
      const metadataHash = utils.createMultihash('My donation');

      const initialBalance = await token.balanceOf(payer);
      const initialCapacitorBalance = await token.balanceOf(capacitor.address);
      const {
        locked: initialLocked,
        unlocked: initialUnlocked,
      } = await utils.capacitorBalances(capacitor);

      const receipt = await capacitor.donate(selfDonor, numTokens, utils.asBytes(metadataHash), {
        from: payer,
      });
      expectEvents(receipt, ['BalancesUpdated', 'Donation']);

      // Check logs
      const {
        payer: emittedPayer,
        donor: emittedDonor,
        numTokens: emittedTokens,
        metadataHash: emittedHash,
      } = receipt.logs[1].args;

      assert.strictEqual(emittedPayer, payer, 'Emitted payer was incorrect');
      assert.strictEqual(emittedDonor, selfDonor, 'Emitted donor was incorrect');
      assert.strictEqual(emittedTokens.toString(), numTokens, 'Emitted token amount was incorrect');
      assert.strictEqual(utils.bytesAsString(emittedHash), metadataHash, 'Emitted metadataHash was incorrect');

      // Check balances
      const transferred = new BN(numTokens);
      const finalBalance = await token.balanceOf(payer);
      const expectedBalance = initialBalance.sub(transferred);
      assert.strictEqual(
        finalBalance.toString(),
        expectedBalance.toString(),
        "Payer's final balance was incorrect",
      );

      const finalCapacitorBalance = await token.balanceOf(capacitor.address);
      const expectedCapacitorBalance = initialCapacitorBalance.add(transferred);
      assert.strictEqual(
        finalCapacitorBalance.toString(),
        expectedCapacitorBalance.toString(),
        "Capacitor's final balance was incorrect",
      );

      // Should increase the locked tokens and leave the unlocked tokens unchanged
      const { locked, unlocked } = await utils.capacitorBalances(capacitor);
      const expectedLocked = initialLocked.add(new BN(numTokens));
      assert.strictEqual(
        locked.toString(),
        expectedLocked.toString(),
        'Locked tokens should have increased',
      );
      assert.strictEqual(
        unlocked.toString(),
        initialUnlocked.toString(),
        'Unlocked tokens should not have changed',
      );
    });

    it('should let a payer donate tokens on behalf of a donor', async () => {
      const numTokens = toPanBase('100');
      const metadataHash = utils.createMultihash('My donation');

      const initialBalance = await token.balanceOf(payer);
      const initialCapacitorBalance = await token.balanceOf(capacitor.address);

      // Donate on behalf of the donor
      const receipt = await capacitor.donate(donor, numTokens, utils.asBytes(metadataHash), {
        from: payer,
      });
      expectEvents(receipt, ['BalancesUpdated', 'Donation']);

      // Check logs
      const {
        payer: emittedPayer,
        donor: emittedDonor,
        numTokens: emittedTokens,
        metadataHash: emittedHash,
      } = receipt.logs[1].args;

      assert.strictEqual(emittedPayer, payer, 'Emitted payer was incorrect');
      assert.strictEqual(emittedDonor, donor, 'Emitted donor was incorrect');
      assert.strictEqual(emittedTokens.toString(), numTokens, 'Emitted token amount was incorrect');
      assert.strictEqual(utils.bytesAsString(emittedHash), metadataHash, 'Emitted metadataHash was incorrect');

      // Check balances
      const transferred = new BN(numTokens);
      const finalBalance = await token.balanceOf(payer);
      const expectedBalance = initialBalance.sub(transferred);
      assert.strictEqual(
        finalBalance.toString(),
        expectedBalance.toString(),
        "Payer's final balance was incorrect",
      );

      const finalCapacitorBalance = await token.balanceOf(capacitor.address);
      const expectedCapacitorBalance = initialCapacitorBalance.add(transferred);
      assert.strictEqual(
        finalCapacitorBalance.toString(),
        expectedCapacitorBalance.toString(),
        "Capacitor's final balance was incorrect",
      );
    });

    it('should let a payer donate tokens on behalf of a unspecified donor (zero address)', async () => {
      const unspecifiedDonor = utils.zeroAddress();

      const numTokens = toPanBase('100');
      const metadataHash = utils.createMultihash('My donation');

      // Donate on behalf of the donor
      const receipt = await capacitor.donate(
        unspecifiedDonor,
        numTokens,
        utils.asBytes(metadataHash),
        { from: payer },
      );
      expectEvents(receipt, ['BalancesUpdated', 'Donation']);

      // Check logs
      const {
        payer: emittedPayer,
        donor: emittedDonor,
        numTokens: emittedTokens,
        metadataHash: emittedHash,
      } = receipt.logs[1].args;

      assert.strictEqual(emittedPayer, payer, 'Emitted payer was incorrect');
      assert.strictEqual(emittedDonor, unspecifiedDonor, 'Emitted donor was incorrect');
      assert.strictEqual(emittedTokens.toString(), numTokens, 'Emitted token amount was incorrect');
      assert.strictEqual(utils.bytesAsString(emittedHash), metadataHash, 'Emitted metadataHash was incorrect');
    });

    it('should allow a donation with an empty metadataHash', async () => {
      const numTokens = toPanBase('100');
      const emptyHash = '';

      // Donate on behalf of the donor
      await capacitor.donate(
        donor,
        numTokens,
        utils.asBytes(emptyHash),
        { from: payer },
      );
    });

    it('should revert if the number of tokens is zero', async () => {
      const numTokens = '0';
      const metadataHash = utils.createMultihash('My donation');

      // Try to donate zero tokens
      try {
        await capacitor.donate(donor, numTokens, utils.asBytes(metadataHash), { from: payer });
      } catch (error) {
        expectRevert(error);
        expectErrorLike(error, 'zero tokens');
        return;
      }
      assert.fail('Allowed a donation of zero tokens');
    });

    it('should revert if the token transfer fails', async () => {
      await token.approve(capacitor.address, '0', { from: payer });

      const numTokens = toPanBase('100');
      const metadataHash = utils.createMultihash('My donation');

      // Try to donate
      try {
        await capacitor.donate(donor, numTokens, utils.asBytes(metadataHash), { from: payer });
      } catch (error) {
        expectRevert(error);
        // no message - SafeMath
        return;
      }
      assert.fail('Donation succeeded even though token transfer failed');
    });
  });

  describe('balances', () => {
    describe('calculateDecay', () => {
      const [creator] = accounts;
      let capacitor;

      // Set up the test cases
      // const testValues = Object.keys(multipliers);
      let testValues = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
      testValues = testValues.concat([3, 7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095]);
      testValues.sort((a, b) => a - b);
      const tests = testValues.map(days => ({
        args: days,
        expected: multipliers[days],
      }));

      before(async () => {
        ({ capacitor } = await utils.newPanvala({ from: creator }));
      });

      tests.forEach((test) => {
        it(`${test.args} days`, async () => {
          const decay = await capacitor.calculateDecay(test.args);
          assert.equal(decay.toString(), test.expected.toString());
        });
      });

      it('should revert if the interval is too large', async () => {
        const days = 4096;
        try {
          await capacitor.calculateDecay(days);
        } catch (error) {
          expectRevert(error);
          expectErrorLike(error, 'too large');
          return;
        }
        assert.fail('Did not revert with an out of range interval');
      });
    });

    describe('updateBalances', () => {
      const [creator] = accounts;
      const supply = 50000000;
      let capacitor;
      let token;
      let scale;
      let initialLockedTime;

      beforeEach(async () => {
        ({ token, capacitor } = await utils.newPanvala({ from: creator }));
        initialLockedTime = await capacitor.lastLockedTime();

        await utils.chargeCapacitor(capacitor, supply, token, { from: creator });
        scale = await capacitor.SCALE();
      });

      const tests = [
        { label: 'time zero', days: 0 },
        { label: 'a day', days: 1 },
        { label: 'a week', days: 7 },
        { label: 'a half life', days: halfLife },
      ];

      // Calculate adjusted update time since the contract doesn't necessarily
      // "consume" all the time available when updating
      const adjustedLockTime = (time) => {
        const elapsedTime = (new BN(time)).sub(initialLockedTime);
        const adjusted = elapsedTime.sub(elapsedTime.mod(timing.ONE_DAY));
        return initialLockedTime.add(adjusted);
      };

      tests.forEach((test) => {
        it(`should decrease the locked balance and increase the unlocked balance properly for ${
          test.label
        }`, async () => {
          const initial = new BN(toPanBase(supply));
          assert.strictEqual(
            (await capacitor.lastLockedBalance()).toString(),
            initial.toString(),
            'Wrong initial locked balance',
          );

          // move forward
          const offset = new BN(timing.ONE_DAY).mul(new BN(test.days));
          await increaseTime(offset);

          // Update and check the balances
          const receipt = await capacitor.updateBalances({ from: creator });
          expectEvents(receipt, ['BalancesUpdated']);

          const expectedLocked = initial.mul(getMultiplier(test.days)).div(scale);
          const expectedUnlocked = initial.sub(expectedLocked);
          const now = await utils.evm.timestamp();
          const balance = await token.balanceOf(capacitor.address);
          const expectedLastLocked = adjustedLockTime(now);

          const {
            unlockedBalance: emittedUnlocked,
            lastLockedBalance: emittedLocked,
            lastLockedTime: emittedTime,
            totalBalance,
          } = receipt.logs[0].args;
          assert.strictEqual(emittedLocked.toString(), expectedLocked.toString(), 'Emitted wrong locked');
          assert.strictEqual(emittedUnlocked.toString(), expectedUnlocked.toString(), 'Emitted wrong unlocked');
          assert.strictEqual(emittedTime.toString(), expectedLastLocked.toString(), 'Emitted wrong time');
          assert.strictEqual(totalBalance.toString(), balance.toString(), 'Emitted wrong balance');

          const unlockedBalance = await capacitor.unlockedBalance();
          const lastLockedBalance = await capacitor.lastLockedBalance();
          const lastLockedTime = await capacitor.lastLockedTime();

          assert.strictEqual(
            unlockedBalance.toString(),
            expectedUnlocked.toString(),
            'Wrong unlocked balance',
          );
          assert.strictEqual(
            lastLockedBalance.toString(),
            expectedLocked.toString(),
            'Wrong locked balance',
          );
          assert.strictEqual(
            lastLockedTime.toString(),
            expectedLastLocked.toString(),
            'Locked time should have been now',
          );
        });
      });

      it('should increase the locked balance if the balance increases outside `donate()`', async () => {
        const increase = new BN(toPanBase(10000));
        await token.transfer(capacitor.address, increase, { from: creator });

        const {
          unlocked: initialUnlocked,
          locked: initialLocked,
        } = await utils.capacitorBalances(capacitor);

        await capacitor.updateBalances();

        const { unlocked, locked } = await utils.capacitorBalances(capacitor);

        const expectedUnlocked = initialUnlocked;
        const expectedLocked = initialLocked.add(increase);
        assert.strictEqual(unlocked.toString(), expectedUnlocked.toString());
        assert.strictEqual(locked.toString(), expectedLocked.toString());
      });

      it('should still update if more than 4096 days have passed since the last update', async () => {
        const days = 4096;

        const initialLocked = await capacitor.lastLockedBalance();
        const expectedLocked = initialLocked.mul(getMultiplier(4095)).div(scale)
          .mul(getMultiplier(1)).div(scale);
        const balance = await token.balanceOf(capacitor.address);
        const expectedUnlocked = balance.sub(expectedLocked);

        // move forward
        const offset = new BN(timing.ONE_DAY).muln(days);
        await increaseTime(offset);

        await capacitor.updateBalances({ from: creator });
        const { locked, unlocked } = await utils.capacitorBalances(capacitor);

        assert.strictEqual(locked.toString(), expectedLocked.toString(), 'Wrong locked');
        assert.strictEqual(unlocked.toString(), expectedUnlocked.toString(), 'Wrong unlocked');
      });

      it('should still update when a huge amount of time has passed since the last update', async () => {
        const days = 365000;
        const offset = new BN(timing.ONE_DAY).muln(days);
        await increaseTime(offset);

        await capacitor.updateBalances({ from: creator });
      });

      it('should not unlock tokens if fewer than 24 hours have passed', async () => {
        const { unlocked: initialUnlocked } = await utils.capacitorBalances(capacitor);

        const targetTime = initialLockedTime.add(timing.ONE_HOUR.muln(23));
        await utils.evm.goTo(targetTime);

        await capacitor.updateBalances();

        const { unlocked } = await utils.capacitorBalances(capacitor);
        assert.strictEqual(unlocked.toString(), initialUnlocked.toString(), 'Tokens were unlocked');
      });

      it('should unlock tokens after 24 hours of hourly donations', async () => {
        const donor = creator;
        const payer = creator;

        const numDonations = new BN(24);
        const numTokens = toPanBase('100');

        // Allocate tokens
        const totalDonation = numDonations.mul(new BN(numTokens));
        await token.approve(capacitor.address, totalDonation, { from: payer });

        // Do initial update
        const metadataHash = utils.createMultihash('My hourly donation');
        const { unlocked } = await utils.capacitorBalances(capacitor);

        // go forward on hour and donate
        const moveAndDonate = async (i) => {
          const hour = i + 1;
          const targetTime = initialLockedTime.add(timing.ONE_HOUR.muln(hour));
          await utils.evm.goTo(targetTime);

          // console.log('donation', i);
          await capacitor.donate(donor, numTokens, utils.asBytes(metadataHash), {
            from: payer,
          });
          const { unlocked: currentUnlocked } = await utils.capacitorBalances(capacitor);
          assert.strictEqual(
            currentUnlocked.toString(),
            unlocked.toString(),
            `Hour ${hour}: Should not unlock tokens`,
          );
        };

        // do 23 hourly donations - unlocked balance should not have changed
        const donationActions = utils
          .range(numDonations.subn(1).toNumber())
          .map(i => () => moveAndDonate(i));

        const hourlyDonations = utils.chain(donationActions);
        await hourlyDonations;

        const { unlocked: intermediateUnlocked } = await utils.capacitorBalances(capacitor);
        assert.strictEqual(
          intermediateUnlocked.toString(),
          unlocked.toString(),
          'Should not have unlocked any tokens',
        );

        // do a 24th one
        await increaseTime(timing.ONE_HOUR);
        await capacitor.donate(donor, numTokens, utils.asBytes(metadataHash), { from: payer });

        // Make sure some tokens have been unlocked
        const { unlocked: finalUnlocked } = await utils.capacitorBalances(capacitor);
        assert(finalUnlocked.gt(unlocked), 'Tokens should have been unlocked');
      });
    });

    describe('projectedLockedBalance', () => {
      const [creator] = accounts;
      let capacitor;
      let token;
      let scale;
      const supply = new BN(50000000);

      before(async () => {
        ({ token, capacitor } = await utils.newPanvala({ from: creator }));
        await token.transfer(capacitor.address, supply, { from: creator });
        await capacitor.updateBalances({ from: creator });
        scale = await capacitor.SCALE();
      });

      const tests = [
        { label: 'time zero', days: 0 },
        { label: 'a day', days: 1 },
        { label: 'a week', days: 7 },
        { label: 'a half life', days: halfLife },
      ];

      tests.forEach((test) => {
        it(`should project correctly for ${test.label}`, async () => {
          const now = await utils.evm.timestamp();
          const offset = timing.ONE_DAY.mul(new BN(test.days));
          const time = offset.add(new BN(now));

          const expectedLocked = supply.mul(getMultiplier(test.days)).div(scale);
          const locked = await capacitor.projectedLockedBalance(time);
          assert.strictEqual(locked.toString(), expectedLocked.toString());
        });
      });

      it('should revert if time is before lastLockedTime', async () => {
        const lastLockedTime = await capacitor.lastLockedTime();
        const time = lastLockedTime.sub(timing.ONE_SECOND);

        try {
          await capacitor.projectedLockedBalance(time);
        } catch (error) {
          expectRevert(error);
          expectErrorLike(error, 'before last locked');
          return;
        }
        assert.fail('Allowed projection into the past');
      });

      it('should project from after the donation', async () => {
        const [, payer] = accounts;

        // Prepare for donation
        const numTokens = '100';
        const metadataHash = utils.createMultihash('My donation');
        await token.transfer(payer, numTokens, { from: creator });
        await token.approve(capacitor.address, numTokens, { from: payer });

        const { locked: initialLocked } = await utils.capacitorBalances(capacitor);

        // Donate
        await capacitor.donate(payer, numTokens, utils.asBytes(metadataHash), { from: payer });

        // Should increase the locked tokens and the projected balance
        const { locked } = await utils.capacitorBalances(capacitor);
        const expectedLocked = initialLocked.add(new BN(numTokens));
        assert.strictEqual(locked.toString(), expectedLocked.toString(), 'Wrong locked');

        // Projected balance should be based on the locked tokens AFTER the donation
        const time = await utils.evm.futureTime(timing.ONE_DAY);
        const projectedLocked = await capacitor.projectedLockedBalance(time);
        const decayFactor = new BN(multipliers[1]);
        const expectedProjected = expectedLocked.mul(decayFactor).div(scale);
        assert.strictEqual(
          projectedLocked.toString(),
          expectedProjected.toString(),
          'Projection should be based on the locked balance AFTER the donation',
        );
      });
    });

    describe('projectedUnlockedBalance', () => {
      const [creator] = accounts;
      let capacitor;
      let token;
      const supply = new BN(50000000);
      let scale;

      before(async () => {
        ({ token, capacitor } = await utils.newPanvala({ from: creator }));
        await token.transfer(capacitor.address, supply, { from: creator });
        await capacitor.updateBalances();

        scale = await capacitor.SCALE();
      });

      const tests = [
        { label: 'time zero', days: 0 },
        { label: 'a day', days: 1 },
        { label: 'a week', days: 7 },
        { label: 'a half life', days: halfLife },
      ];

      tests.forEach((test) => {
        it(`should project correctly for ${test.label}`, async () => {
          const now = await utils.evm.timestamp();
          const offset = timing.ONE_DAY.mul(new BN(test.days));
          const time = offset.add(new BN(now));

          const expectedLocked = supply.mul(getMultiplier(test.days)).div(scale);
          const expectedUnlocked = supply.sub(expectedLocked);
          const unlocked = await capacitor.projectedUnlockedBalance(time);
          assert.strictEqual(unlocked.toString(), expectedUnlocked.toString());
        });
      });

      it('should revert if time is before lastLockedTime', async () => {
        const lastLockedTime = await capacitor.lastLockedTime();
        const time = lastLockedTime.sub(timing.ONE_SECOND);

        try {
          await capacitor.projectedUnlockedBalance(time);
        } catch (error) {
          expectRevert(error);
          expectErrorLike(error, 'before last locked');
          return;
        }
        assert.fail('Allowed projection into the past');
      });
    });
  });
});
