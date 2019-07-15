import { utils } from 'ethers';
import { BigNumber } from 'ethers/utils';
import { IProposal, ISlate } from '../../interfaces';
import { projectedAvailableTokens } from '../../utils/tokens';
import { connectContracts } from '../../utils/provider';
import { baseToConvertedUnits } from '../../utils/format';
import Eth from '../rpc';
// const { Eth } = require('../rpc');

export const proposals: IProposal[] = [
  {
    id: 0,
    category: 'GRANT',
    firstName: 'Amanda',
    lastName: 'Crypto',
    title: 'A great project',
    tokensRequested: '420000000000000000000',
    summary:
      "Plasma is a family of protocols which allow individuals to easily deploy high-throughput, secure blockchains. A smart contract on Ethereum’s main chain can ensure that users’ funds are secure, even if the “plasma chain” acts fully maliciously. This eliminates the need for a trusted pegging mechanism like that of sidechains. Plasma chains are non-custodial, allowing the prioritization of scalability without sacrificing security. We’ve devised a new architecture for building Plasma apps on one generalized plasma chain. It establishes a clean separation between the plasma layer and the application layer. We will publish a generalized Plasma predicate contract framework, which allows for upgradeability and composability of plasma contracts. Since plasma research moves so quickly, we realized we needed to develop an architecture that allowed for maximal modularity, to prevent vast chunks of code from being thrown away with each new research discovery. With that framework, we will refactor our existing codebase for secure payments using predicates. We want to use the generalized Plasma research we did and put it to the test in our codebase refactor following the launch of our testnet on January 31. Dogfooding is a critical part of the work we do, as there's no point to open sourcing the codebase if it's not readable or easy to use.",
    awardAddress: '0xd115bffabbdd893a6f7cea402e7338643ced44a6',
    projectTimeline: 'timeline',
    teamBackgrounds: 'backgrounds',
  },
];

export const slates: ISlate[] = [
  {
    id: 0,
    category: 'GRANT',
    status: 2,
    owner: 'John Doe',
    recommender: '0xd115bffabbdd893a6f7cea402e7338643ced44a6',
    organization: 'Team Recommender',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer eu nibh molestie, auctor ligula a, faucibus ante. Morbi dapibus enim in vulputate congue. Mauris feugiat gravida nibh, sed pellentesque eros pellentesque eu. Sed rutrum vitae magna sed aliquet. Suspendisse facilisis vulputate lobortis. Vestibulum sed dolor eu mi molestie pharetra. Duis ut diam aliquam, molestie erat non, scelerisque ligula. Curabitur accumsan ipsum pellentesque posuere ornare. Sed vulputate cursus accumsan. Morbi efficitur dictum magna, a imperdiet mauris aliquet vitae.',
    proposals,
    requiredStake: utils.bigNumberify('300000000000000000000'),
    verifiedRecommender: true,
    incumbent: false,
    staker: '0xd115bffabbdd893a6f7cea402e7338643ced44a6',
    epochNumber: 1,
  },
  {
    id: 0,
    category: 'GRANT',
    status: 3,
    owner: 'John Doe',
    recommender: '0xd115bffabbdd893a6f7cea402e7338643ced44a6',
    organization: 'Team Recommender',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer eu nibh molestie, auctor ligula a, faucibus ante. Morbi dapibus enim in vulputate congue. Mauris feugiat gravida nibh, sed pellentesque eros pellentesque eu. Sed rutrum vitae magna sed aliquet. Suspendisse facilisis vulputate lobortis. Vestibulum sed dolor eu mi molestie pharetra. Duis ut diam aliquam, molestie erat non, scelerisque ligula. Curabitur accumsan ipsum pellentesque posuere ornare. Sed vulputate cursus accumsan. Morbi efficitur dictum magna, a imperdiet mauris aliquet vitae.',
    proposals,
    requiredStake: utils.bigNumberify('300000000000000000000'),
    verifiedRecommender: true,
    incumbent: false,
    staker: '0xd115bffabbdd893a6f7cea402e7338643ced44a6',
    epochNumber: 1,
  },
];

describe('Tokens', () => {
  test('should return the correct number of tokens currently available in an epoch', async () => {
    console.log('Eth:', Eth);
    const { provider, gatekeeper } = Eth;
    console.log('provider:', JSON.stringify(provider));
    const blockNumber = await provider.getBlockNumber();
    console.log('blockNumber:', blockNumber);
    // const { gatekeeper, tokenCapacitor } = await connectContracts(provider as any);
    // const epochNumber = await gatekeeper.currentEpochNumber();
    // console.log('epochNumber:', epochNumber.toString());
    // const nextEpochStart = await gatekeeper.functions.epochStart(epochNumber.add(1));
    // const pUnlockedBalance = await tokenCapacitor.functions.projectedUnlockedBalance(
    //   nextEpochStart
    // );
    // const unredeemedGrants: any = slates.find(s => s.status === 3);
    // console.log('unredeemedGrants:', unredeemedGrants.proposals);
    // const available = await projectedAvailableTokens(
    //   tokenCapacitor,
    //   gatekeeper,
    //   epochNumber,
    //   slates[1]
    // );
    // const unredeemedBalance = unredeemedGrants.reduce((acc: BigNumber, p: IProposal) => {
    //   return acc.add(p.tokensRequested);
    // }, utils.bigNumberify('0'));
    // const actual = baseToConvertedUnits(available);
    // const expected = pUnlockedBalance.sub(unredeemedBalance);
    // expect(actual).toBe(expected);
  });
});
