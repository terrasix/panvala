import * as React from 'react';
import * as yup from 'yup';
import styled from 'styled-components';
import { Formik, Form } from 'formik';
import { Separator } from '../components/Separator';
import Label from './Label';
import SectionLabel from './SectionLabel';
import Button from './Button';
import { toast } from 'react-toastify';
import FieldText from './FieldText';
import FieldTextarea from './FieldTextarea';
import { convertedToBaseUnits } from '../utils/format';
import Flex from './system/Flex';
import BackButton from './BackButton';
import Box from './system/Box';

const FormSchema = yup.object().shape({
  firstName: yup
    .string()
    .min(2, 'Too Short!')
    .max(70, 'Too Long!')
    .required('Required'),
  lastName: yup
    .string()
    .min(2, 'Too Short!')
    .max(70, 'Too Long!'),
  email: yup
    .string()
    .email('Invalid email')
    .required('Required'),
  title: yup
    .string()
    .max(70, 'Too Long!')
    .required('Required'),
  summary: yup
    .string()
    .max(4000, 'Too Long!')
    .required('Required'),
  tokensRequested: yup
    .string()
    .matches(/^[0-9]+\.?[0-9]{0,18}$/, 'Must be a number with no more than 18 decimals')
    .required('Required'),
  totalBudget: yup.string(),
  otherFunding: yup.string(),
  awardAddress: yup.string().required('Required'),
});

interface IProps {
  onHandleSubmit: any;
}

const ProposalForm: React.SFC<IProps> = ({ onHandleSubmit }) => {
  return (
    <div>
      <Formik
        initialValues={{
          firstName: '',
          lastName: '',
          email: '',
          github: '',
          tokensRequested: '',
          title: '',
          summary: '',
          website: '',
          projectPlan: '',
          projectTimeline: '',
          teamBackgrounds: '',
          file: {},
          totalBudget: '',
          otherFunding: '',
          awardAddress: '',
        }}
        validationSchema={FormSchema}
        onSubmit={async (values, { setSubmitting, setFieldError }) => {
          try {
            // throws on underflow (x.1234567890123456789)
            const tokensRequested = convertedToBaseUnits(values.tokensRequested, 18);

            const baseUnitsValues = {
              ...values,
              tokensRequested,
              // max: totalUpcomingDispatch
            };
            await onHandleSubmit(baseUnitsValues);
          } catch (error) {
            setFieldError('tokensRequested', 'Number cannot have more than 18 decimals');
          }

          setSubmitting(false);
        }}
      >
        {({ isSubmitting, setFieldValue, handleSubmit }) => (
          <Box>
            <Form>
              <PaddedDiv>
                <SectionLabel>{'PERSONAL INFORMATION'}</SectionLabel>

                <FieldText
                  required
                  label={'First Name / Organization'}
                  name="firstName"
                  placeholder="Enter your first name or the name of your organization"
                />
                <FieldText label={'Last Name'} name="lastName" placeholder="Enter your last name" />
                <FieldText required label={'Email'} name="email" placeholder="Enter your email" />
                <FieldText
                  label={'Github'}
                  name="github"
                  placeholder="Enter your github username"
                />
              </PaddedDiv>

              <Separator />

              <PaddedDiv>
                <SectionLabel>{'PROJECT DETAILS'}</SectionLabel>

                <FieldText
                  required
                  label={'Project Name'}
                  name="title"
                  placeholder="Enter project name"
                />
                <FieldText label={'Website'} name="website" placeholder="Enter project website" />

                <FieldTextarea
                  required
                  label={'Project Summary'}
                  name="summary"
                  placeholder="Enter project proposal"
                />
                <FieldTextarea
                  label={'Timeline and Milestones'}
                  name="projectTimeline"
                  placeholder="Enter project timeline and milestones"
                />
                <FieldTextarea
                  label={"What are your and your team's backgrounds?"}
                  name="teamBackgrounds"
                  placeholder="Enter your and your team's backgrounds"
                />

                <Label htmlFor="file">{'File upload'}</Label>
                <Box mt={2}>
                  <input
                    type="file"
                    name="file"
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      if (!event.currentTarget.files) {
                        return;
                      }
                      const file = event.currentTarget.files[0];
                      if (file.type !== 'application/pdf') {
                        toast.error('Invalid file type. Please upload .pdf');
                        setFieldValue('file', {});
                      } else {
                        setFieldValue('file', file);
                      }
                    }}
                    placeholder="Choose file"
                  />
                </Box>
              </PaddedDiv>

              <Separator />

              <PaddedDiv>
                <SectionLabel>{'FINANCIAL DETAILS'}</SectionLabel>

                <FieldTextarea
                  label={'What is the total budget of your project (in USD)?'}
                  name="totalBudget"
                  placeholder="Enter the total budget of your project"
                />

                <FieldText
                  required
                  label={'How many tokens are you requesting?'}
                  name="tokensRequested"
                  placeholder="Enter the amount of tokens you would like"
                />

                <FieldText
                  required
                  label={'Ethereum wallet address for award'}
                  name="awardAddress"
                  placeholder="Enter the address of the token recipient for this proposal"
                />

                <FieldTextarea
                  label={'Have you applied/received other funding?'}
                  name="otherFunding"
                  placeholder="Enter any other funding you have received"
                />
              </PaddedDiv>

              <Separator />
            </Form>

            <Flex p={4} justifyEnd>
              <BackButton />
              <Button type="submit" large primary disabled={isSubmitting} onClick={handleSubmit}>
                {'Confirm and Submit'}
              </Button>
            </Flex>
          </Box>
        )}
      </Formik>
    </div>
  );
};

const PaddedDiv = styled.div`
  padding: 2rem;
`;

export default ProposalForm;
