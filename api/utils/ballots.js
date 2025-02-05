const { isEthereumAddress, isObject, nonEmptyString, isBigNumber } = require('./validation');

const validBN = {
  ...nonEmptyString,
  custom: {
    options: isBigNumber,
  },
};

// NOTE: Ballot data received in a POST request is validated by schemas/ballot.json

/**
 * Ballot data to be fed to the ORM
 {
   epochNumber: String,
   salt: String,
   voterAddress: String,
   signature: String,
   salt: String,
   voteChoices: [
     {
       firstChoice: String,
       secondChoice: String,
       resource: String, // address
     }
   ],
 }
 */
const ballotInsertSchema = {
  // ballot data
  epochNumber: {
    in: ['body'],
    ...nonEmptyString,
    isInt: true,
  },
  voterAddress: {
    in: ['body'],
    ...nonEmptyString,
    custom: {
      options: isEthereumAddress,
    },
  },
  salt: {
    in: ['body'],
    ...nonEmptyString,
    // isInt: true,
  },

  // vote choices
  'voteChoices.*.firstChoice': {
    in: ['body'],
    isNull: false,
    ...nonEmptyString,
  },
  'voteChoices.*.secondChoice': {
    in: ['body'],
    ...nonEmptyString,
  },
  'voteChoices.*.salt': {
    in: ['body'],
    ...nonEmptyString,
  },
  'voteChoices.*.resource': {
    in: ['body'],
    ...nonEmptyString,
    custom: {
      options: isEthereumAddress,
    },
  },

  // signature of the ballot data
  signature: {
    in: ['body'],
    ...nonEmptyString,
  },
};

module.exports = {
  ballotInsertSchema,
};
