import * as React from 'react';
import styled from 'styled-components';
import { Formik, Form, FormikContext } from 'formik';
import { TransactionResponse, TransactionReceipt } from 'ethers/providers';
import { utils } from 'ethers';
import { MaxUint256 } from 'ethers/constants';
import { ContractReceipt } from 'ethers/contract';
import { toast } from 'react-toastify';
import * as yup from 'yup';
import { withStyles } from '@material-ui/core';
import isEmpty from 'lodash/isEmpty';
import { withRouter, SingletonRouter } from 'next/router';

import { COLORS } from '../../../styles';
import CenteredTitle from '../../../components/CenteredTitle';
import Checkbox from '../../../components/Checkbox';
import { MainContext, IMainContext } from '../../../components/MainProvider';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import { EthereumContext, IEthereumContext } from '../../../components/EthereumProvider';
import FieldText, { ErrorMessage } from '../../../components/FieldText';
import FieldTextarea from '../../../components/FieldTextarea';
import CenteredWrapper from '../../../components/CenteredWrapper';
import Label from '../../../components/Label';
import SectionLabel from '../../../components/SectionLabel';
import Modal, { ModalTitle, ModalDescription } from '../../../components/Modal';
import Image from '../../../components/Image';
import RouterLink from '../../../components/RouterLink';
import {
  IProposal,
  IGrantProposalMetadata,
  ISlateMetadata,
  ISaveSlate,
  StatelessPage,
  ISlate,
  IGrantProposalInfo,
} from '../../../interfaces';
import { TokenCapacitor } from '../../../types';
import {
  sendCreateManyProposalsTransaction,
  sendStakeTokensTransaction,
} from '../../../utils/transaction';
import { ipfsAddObject } from '../../../utils/ipfs';
import {
  convertedToBaseUnits,
  formatPanvalaUnits,
  baseToConvertedUnits,
} from '../../../utils/format';
import { postSlate } from '../../../utils/api';
import { PROPOSAL } from '../../../utils/constants';
import Flex from '../../../components/system/Flex';
import BackButton from '../../../components/BackButton';
import Box from '../../../components/system/Box';
import Text from '../../../components/system/Text';
import { isSlateSubmittable } from '../../../utils/status';
import { projectedAvailableTokens } from '../../../utils/tokens';
import Loader from '../../../components/Loader';

const Separator = styled.div`
  border: 1px solid ${COLORS.grey5};
`;

const FormSchema = yup.object().shape({
  email: yup
    .string()
    .email('Invalid email')
    .required('Required'),
  firstName: yup.string().required('Required'),
  description: yup
    .string()
    .max(5000, 'Too Long!')
    .required('Required'),
  recommendation: yup.string().required('Required'),
  stake: yup.string().required('Required'),
});

interface IProposalsObject {
  [key: string]: boolean;
}
interface IFormValues {
  email: string;
  firstName: string;
  lastName?: string;
  organization?: string;
  description: string;
  recommendation: string;
  proposals: IProposalsObject;
  selectedProposals: IProposal[];
  stake: string;
}
interface IProps {
  query: any;
  router?: SingletonRouter;
}

const CreateGrantSlate: StatelessPage<IProps> = ({ query, router }) => {
  // get proposals and eth context
  const {
    slates,
    slatesByID,
    proposals,
    currentBallot,
    onRefreshSlates,
    onRefreshCurrentBallot,
  }: IMainContext = React.useContext(MainContext);
  const {
    account,
    contracts,
    onRefreshBalances,
    slateStakeAmount,
    gkAllowance,
  }: IEthereumContext = React.useContext(EthereumContext);

  React.useEffect(() => {
    if (!isSlateSubmittable(currentBallot, 'GRANT')) {
      toast.error('Grant slate submission deadline has passed');
      router.push('/slates');
    }
  }, [currentBallot.slateSubmissionDeadline]);

  // modal opener
  const [isOpen, setOpenModal] = React.useState(false);
  // pending tx loader
  const [txsPending, setTxsPending] = React.useState(0);
  const [availableTokens, setAvailableTokens] = React.useState('0');

  React.useEffect(() => {
    async function getProjectedAvailableTokens() {
      let winningSlate: ISlate | undefined;
      const lastEpoch = currentBallot.epochNumber - 1;
      try {
        const winningSlateID = await contracts.gatekeeper.functions.getWinningSlate(
          lastEpoch,
          contracts.tokenCapacitor.address
        );
        winningSlate = slatesByID[winningSlateID.toString()];
      } catch {} // if the query reverts, epoch hasn't been finalized yet

      const tokens = await projectedAvailableTokens(
        contracts.tokenCapacitor,
        contracts.gatekeeper,
        currentBallot.epochNumber,
        winningSlate
      );
      setAvailableTokens(tokens.toString());
    }
    if (
      !isEmpty(contracts.tokenCapacitor) &&
      !isEmpty(contracts.gatekeeper) &&
      contracts.tokenCapacitor.functions.hasOwnProperty('projectedUnlockedBalance')
    ) {
      getProjectedAvailableTokens();
    }
  }, [contracts, currentBallot.epochNumber, slates]);

  //  Submit proposals to the token capacitor and get corresponding request IDs
  async function getRequestIDs(proposalInfo: IGrantProposalInfo, tokenCapacitor: TokenCapacitor) {
    const { metadatas, multihashes: proposalMultihashes } = proposalInfo;
    // submit to the capacitor, get requestIDs
    // token distribution details
    const beneficiaries: string[] = metadatas.map(p => p.awardAddress);
    const tokenAmounts: string[] = metadatas.map(p => convertedToBaseUnits(p.tokensRequested, 18));
    console.log('tokenAmounts:', tokenAmounts);

    try {
      const response: TransactionResponse = await sendCreateManyProposalsTransaction(
        tokenCapacitor,
        beneficiaries,
        tokenAmounts,
        proposalMultihashes
      );

      // wait for tx to get mined
      const receipt: TransactionReceipt = await response.wait();

      if ('events' in receipt) {
        // Get the ProposalCreated logs from the receipt
        // Extract the requestIDs
        const requestIDs = (receipt as any).events
          .filter(event => event.event === 'ProposalCreated')
          .map(e => e.args.requestID);
        return requestIDs;
      }
      throw new Error('receipt did not contain any events');
    } catch (error) {
      throw error;
    }
  }

  // Submit requestIDs and metadataHash to the Gatekeeper.
  async function submitGrantSlate(requestIDs: any[], metadataHash: string): Promise<any> {
    if (!isEmpty(contracts.gatekeeper)) {
      const estimate = await contracts.gatekeeper.estimate.recommendSlate(
        contracts.tokenCapacitor.address,
        requestIDs,
        Buffer.from(metadataHash)
      );
      const txOptions = {
        gasLimit: estimate.add('100000').toHexString(),
        gasPrice: utils.parseUnits('9.0', 'gwei'),
      };
      const response = await (contracts.gatekeeper as any).functions.recommendSlate(
        contracts.tokenCapacitor.address,
        requestIDs,
        Buffer.from(metadataHash),
        txOptions
      );

      const receipt: ContractReceipt = await response.wait();

      if (typeof receipt.events !== 'undefined') {
        // Get the SlateCreated logs from the receipt
        // Extract the slateID
        const slateID = receipt.events
          .filter(event => event.event === 'SlateCreated')
          .map(e => e.args.slateID.toString());
        const slate: any = { slateID, metadataHash };
        console.log('Created slate', slate);
        return slate;
      }
    }
  }

  async function calculateNumTxs(values, selectedProposals) {
    let numTxs: number = 1; // gk.recommendSlate

    if (selectedProposals.length > 0) {
      numTxs += 1; // tc.createManyProposals
    }

    if (values.stake === 'yes') {
      numTxs += 1; // gk.stakeSlate
      if (gkAllowance.lt(slateStakeAmount)) {
        numTxs += 1; // token.approve
      }
    }

    return numTxs;
  }

  /**
   * Submit slate information to the Gatekeeper, saving metadata in IPFS
   *
   * add proposals to ipfs, get multihashes
   * send tx to token_capacitor: createManyProposals (with multihashes)
   * get requestIDs from events
   * add slate to IPFS with metadata
   * send tx to gate_keeper: recommendSlate (with requestIDs & slate multihash)
   * get slateID from event
   * add slate to db: slateID, multihash
   */
  async function handleSubmitSlate(values: IFormValues, selectedProposals: IProposal[]) {
    if (!account || !onRefreshSlates || !contracts) {
      const msg =
        'To create a slate, you must first log into MetaMask and switch to the Rinkeby Test Network.';
      toast.error(msg);
      return;
    }
    const numTxs = await calculateNumTxs(values, selectedProposals);
    setTxsPending(numTxs);

    // save proposal metadata to IPFS to be included in the slate metadata
    console.log('preparing proposals...');

    // const dataToPost = {
    //   selectedProposals,

    // }

    const proposalMultihashes: Buffer[] = await Promise.all(
      selectedProposals.map(async (metadata: IGrantProposalMetadata) => {
        try {
          const multihash: string = await ipfsAddObject(metadata);
          // we need a buffer of the multihash for the transaction
          return Buffer.from(multihash);
        } catch (error) {
          return error;
        }
      })
    );
    // TODO: add proposal multihashes to db

    // Only use the metadata from here forward - do not expose private information
    const proposalMetadatas: IGrantProposalMetadata[] = selectedProposals.map(proposal => {
      return {
        firstName: proposal.firstName,
        lastName: proposal.lastName,
        title: proposal.title,
        summary: proposal.summary,
        tokensRequested: proposal.tokensRequested,
        github: proposal.github,
        id: proposal.id,
        website: proposal.website,
        organization: proposal.organization,
        recommendation: proposal.recommendation,
        projectPlan: proposal.projectPlan,
        projectTimeline: proposal.projectTimeline,
        teamBackgrounds: proposal.teamBackgrounds,
        otherFunding: proposal.otherFunding,
        awardAddress: proposal.awardAddress,
      };
    });

    let errorMessage = '';
    const emptySlate = proposalMetadatas.length === 0;

    // 1. batch create proposals and get request IDs
    const proposalInfo: IGrantProposalInfo = {
      metadatas: proposalMetadatas,
      multihashes: proposalMultihashes,
    };

    const getRequests = emptySlate
      ? Promise.resolve([])
      : await getRequestIDs(proposalInfo, contracts.tokenCapacitor);

    try {
      // console.log('creating proposals...');
      const requestIDs = await getRequests;

      const slateMetadata: ISlateMetadata = {
        firstName: values.firstName,
        lastName: values.lastName,
        organization: values.organization,
        description: values.description,
        proposalMultihashes: proposalMultihashes.map(md => md.toString()),
        proposals: proposalMetadatas,
      };
      // console.log(slateMetadata);

      try {
        console.log('saving slate metadata...');
        const slateMetadataHash: string = await ipfsAddObject(slateMetadata);

        // Submit the slate info to the contract
        try {
          const slate: any = await submitGrantSlate(requestIDs, slateMetadataHash);
          console.log('Submitted slate', slate);

          // Add slate to db
          const slateToSave: ISaveSlate = {
            slateID: slate.slateID,
            metadataHash: slateMetadataHash,
            email: values.email,
            proposalInfo,
          };

          // api should handle updating, not just adding
          const response = await postSlate(slateToSave);
          if (response.status === 200) {
            console.log('Saved slate info');
            toast.success('Saved slate');

            // stake immediately after creating slate
            if (values.stake === 'yes') {
              if (gkAllowance.lt(slateStakeAmount)) {
                await contracts.token.approve(contracts.gatekeeper.address, MaxUint256);
              }
              const res = await sendStakeTokensTransaction(contracts.gatekeeper, slate.slateID);

              await res.wait();
            }

            setTxsPending(0);
            setOpenModal(true);
            onRefreshSlates();
            onRefreshCurrentBallot();
            onRefreshBalances();
          } else {
            errorMessage = `problem saving slate info ${response.data}`;
            toast.error(errorMessage);
          }
          // end add slate
        } catch (error) {
          errorMessage = `error submitting slate ${error.message}`;
          toast.error(errorMessage);
        }
      } catch (error) {
        errorMessage = `error saving slate metadata: ${error.message}`;
        // console.error(errorMessage);
        toast.error(errorMessage);
      }
    } catch (error) {
      errorMessage = `error preparing proposals : ${error.message}`;
      console.error(errorMessage);
      toast.error(errorMessage);
    }
  }

  const initialValues =
    process.env.NODE_ENV === 'development'
      ? {
          email: 'email@email.com',
          firstName: 'Guy',
          lastName: 'Reid',
          organization: 'Panvala',
          description: 'Only the best proposals',
          recommendation: query && query.id ? 'grant' : '',
          proposals: query && query.id ? { [query.id.toString()]: true } : {},
          selectedProposals: [],
          stake: 'no',
        }
      : {
          email: '',
          firstName: '',
          lastName: '',
          organization: '',
          description: '',
          recommendation: query && query.id ? 'grant' : '',
          proposals: query && query.id ? { [query.id.toString()]: true } : {},
          selectedProposals: [],
          stake: 'no',
        };

  return (
    <div>
      <Modal handleClick={() => setOpenModal(false)} isOpen={isOpen}>
        <>
          <Image src="/static/check.svg" alt="slate submitted" width="80px" />
          <ModalTitle>{'Slate submitted.'}</ModalTitle>
          <ModalDescription className="flex flex-wrap">
            Now that your slate has been created you and others have the ability to stake tokens on
            it to propose it to token holders. Once there are tokens staked on the slate it will be
            eligible for a vote.
          </ModalDescription>
          <RouterLink href="/slates" as="/slates">
            <Button type="default">{'Done'}</Button>
          </RouterLink>
        </>
      </Modal>

      <CenteredTitle title="Create a Grant Slate" />
      <CenteredWrapper>
        <Formik
          initialValues={initialValues}
          validationSchema={FormSchema}
          onSubmit={async (values: IFormValues, { setSubmitting, setFieldError }: any) => {
            const emptySlate = values.recommendation === 'noAction';

            if (emptySlate) {
              // submit the form values with no proposals
              await handleSubmitSlate(values, []);
            } else {
              const selectedProposalIDs: string[] = Object.keys(values.proposals).filter(
                (p: string) => values.proposals[p] === true
              );

              // validate for at least 1 selected proposal
              if (selectedProposalIDs.length === 0) {
                setFieldError('proposals', 'select at least 1 proposal.');
              } else if (proposals && proposals.length) {
                // filter for only the selected proposal objects
                const selectedProposals: IProposal[] = proposals.filter((p: IProposal) =>
                  selectedProposalIDs.includes(p.id.toString())
                );

                const totalTokens = selectedProposals.reduce((acc, val) => {
                  return utils
                    .bigNumberify(acc)
                    .add(convertedToBaseUnits(val.tokensRequested))
                    .toString();
                }, '0');
                if (
                  contracts.tokenCapacitor.functions.hasOwnProperty('projectedUnlockedBalance') &&
                  utils.bigNumberify(totalTokens).gt(availableTokens)
                ) {
                  setFieldError(
                    'proposals',
                    `token amount exceeds the projected available tokens (${baseToConvertedUnits(
                      availableTokens
                    )})`
                  );
                } else {
                  // submit the associated proposals along with the slate form values
                  await handleSubmitSlate(values, selectedProposals);
                }
              }
            }

            // re-enable submit button
            setSubmitting(false);
          }}
        >
          {({ isSubmitting, setFieldValue, values, handleSubmit }: FormikContext<IFormValues>) => (
            <Box>
              <Form>
                <PaddedDiv>
                  <SectionLabel>{'ABOUT'}</SectionLabel>

                  <FieldText required label={'Email'} name="email" placeholder="Enter your email" />

                  <FieldText
                    required
                    label={'First Name'}
                    name="firstName"
                    placeholder="Enter your first name"
                  />
                  <FieldText
                    label={'Last Name'}
                    name="lastName"
                    placeholder="Enter your last name"
                  />
                  <FieldText
                    label={'Organization Name'}
                    name="organization"
                    placeholder="Enter your organization's name"
                  />

                  <FieldTextarea
                    required
                    label={'Description'}
                    name="description"
                    placeholder="Enter a description for your slate"
                  />
                </PaddedDiv>
                <Separator />
                <PaddedDiv>
                  <SectionLabel>{'RECOMMENDATION'}</SectionLabel>
                  <Label htmlFor="recommendation" required>
                    {'What type of recommendation would you like to make?'}
                  </Label>
                  <ErrorMessage name="recommendation" component="span" />
                  <div>
                    <Checkbox
                      name="recommendation"
                      value="grant"
                      label="Recommend grant proposals"
                    />
                    <Checkbox name="recommendation" value="noAction" label="Recommend no action" />
                  </div>
                  <RadioSubText>
                    By recommending no action you are opposing any current or future slates for this
                    batch.
                  </RadioSubText>
                </PaddedDiv>
                {values.recommendation === 'grant' && (
                  <>
                    <Separator />
                    <PaddedDiv>
                      <SectionLabel>{'GRANTS'}</SectionLabel>
                      <Label htmlFor="proposals" required>
                        {'Select the grants that you would like to add to your slate'}
                      </Label>
                      <ErrorMessage name="proposals" component="span" />

                      {contracts.tokenCapacitor.functions.hasOwnProperty(
                        'projectedUnlockedBalance'
                      ) && (
                        <Text fontSize="0.75rem" color="grey">
                          {`(There are currently `}
                          <strong>{`${baseToConvertedUnits(
                            availableTokens
                          )} PAN tokens available`}</strong>
                          {` for grant proposals at this time.)`}
                        </Text>
                      )}

                      <FlexContainer>
                        {proposals &&
                          proposals.map((proposal: IProposal) => (
                            <Card
                              key={proposal.id}
                              category={`${proposal.category} PROPOSAL`}
                              title={proposal.title}
                              subtitle={proposal.tokensRequested.toString()}
                              description={proposal.summary}
                              onClick={() => {
                                if (values.proposals.hasOwnProperty(proposal.id)) {
                                  setFieldValue(
                                    `proposals.${proposal.id}`,
                                    !values.proposals[proposal.id]
                                  );
                                } else {
                                  setFieldValue(`proposals.${proposal.id}`, true);
                                }
                              }}
                              isActive={values.proposals[proposal.id]}
                              type={PROPOSAL}
                              width={['98%', '47%']}
                            />
                          ))}
                      </FlexContainer>
                    </PaddedDiv>
                  </>
                )}
                <Separator />
                <PaddedDiv>
                  <SectionLabel>STAKE</SectionLabel>
                  <Label htmlFor="stake" required>
                    {`Would you like to stake ${formatPanvalaUnits(
                      slateStakeAmount
                    )} tokens for this slate? This makes your slate eligible for the current batch.`}
                  </Label>
                  <ErrorMessage name="stake" component="span" />
                  <div>
                    <Checkbox name="stake" value="yes" label="Yes" />
                    <RadioSubText>
                      By selecting yes, you will stake tokens for your own slate and not have to
                      rely on others to stake tokens for you.
                    </RadioSubText>
                    <Checkbox name="stake" value="no" label="No" />
                    <RadioSubText>
                      By selecting no, you will have to wait for others to stake tokens for your
                      slate or you can stake tokens after you have created the slate.
                    </RadioSubText>
                  </div>
                </PaddedDiv>
                <Separator />
              </Form>
              <Flex p={4} justifyEnd>
                <BackButton />
                <Button type="submit" large primary disabled={isSubmitting} onClick={handleSubmit}>
                  {'Create Slate'}
                </Button>
              </Flex>
              <Loader
                isOpen={txsPending > 0}
                setOpen={() => setTxsPending(0)}
                numTxs={txsPending}
              />
            </Box>
          )}
        </Formik>
      </CenteredWrapper>
    </div>
  );
};

const RadioSubText = styled.div`
  margin-left: 2.5rem;
  font-size: 0.75rem;
  color: ${COLORS.grey3};
`;

const FlexContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
`;

const PaddedDiv = styled.div`
  padding: 2rem;
`;

CreateGrantSlate.getInitialProps = async ({ query, classes }) => {
  return { query, classes };
};

const styles = (theme: any) => ({
  progress: {
    margin: theme.spacing.unit * 2,
    color: COLORS.primary,
  },
});

export default withStyles(styles)(withRouter(CreateGrantSlate));
