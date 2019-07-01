// ----------------------------------------------------------------------------------------
// NOT IN-USE ATM
// ----------------------------------------------------------------------------------------

/**
 * Gets all events from genesis block (contract) -> current block
 * get logs in blocks, transactions -> events
 */
async function getAllEventss() {
  try {
    const { gatekeeper, provider, tokenCapacitor } = getContracts();

    // TEMPORARY WORKAROUND: prevent app from crashing on rinkeby network
    const network = await provider.getNetwork();
    if (network.chainId === 4) {
      return [];
    }

    const currentBlockNumber = await provider.getBlockNumber();
    console.log('currentBlockNumber:', currentBlockNumber);

    const { chainId } = await provider.getNetwork();
    if (chainId === 4) {
      return [];
    }
    const genesisBlockNumber = genesisBlockNumbers[chainId] || 1;
    console.log('genesisBlockNumber:', genesisBlockNumber);
    const blocksRange = range(genesisBlockNumber, currentBlockNumber + 1);

    const events = await Promise.all(
      blocksRange.map(async blockNumber => {
        const block = await provider.getBlock(blockNumber, true);
        const logsInBlock = await getLogsInBlock(block, provider, gatekeeper, tokenCapacitor);
        // [[Log, Log]] -> [Log, Log]
        // [[]] -> []
        return flatten(logsInBlock);
      })
    );

    // [[], [], [Log, Log]] -> [Log, Log]
    return flatten(events);
  } catch (error) {
    console.error('ERROR while getting events', error.message);
    throw error;
  }
}

// ----------------------------------------------------------------------------------------
// get transactions and encoded logs in a single block

/**
 * Gets decoded logs from all transactions in a single block
 * @param {*} block
 * @returns {Array}
 */
async function getLogsInBlock(block, provider, gatekeeper, tokenCapacitor) {
  return Promise.all(
    block.transactions.map(async tx => {
      return provider.getTransactionReceipt(tx.hash).then(receipt => {
        if (receipt.logs.length > 0) {
          const gkEvents = decodeLogs(gatekeeper, block, tx, receipt.logs);
          const tcEvents = decodeLogs(tokenCapacitor, block, tx, receipt.logs);
          return gkEvents.concat(tcEvents);
        }
        return [];
      });
    })
  );
}

// ----------------------------------------------------------------------------------------
// decode logs in a single transaction

const extraneousEventNames = [
  'PermissionRequested',
  // 'VotingTokensDeposited',
  // 'VotingTokensWithdrawn',
];

/**
 * Decodes raw logs using an ethers.js contract interface
 * @param {ethers.Contract} contract ethers.js contract
 * @param {*} block
 * @param {*} tx transaction from a block
 * @param {*} logs raw logs
 * @returns Filtered (!null) array of decoded logs w/ additional transaction information
 */
function decodeLogs(contract, block, tx, logs) {
  return logs
    .map(log => {
      let decoded = contract.interface.parseLog(log);
      if (decoded) {
        if (extraneousEventNames.includes(decoded.name)) {
          return null;
        }
        return {
          ...decoded,
          sender: tx.from,
          recipient: tx.to,
          timestamp: block.timestamp,
          blockNumber: block.number,
          txHash: tx.hash,
          logIndex: log.logIndex,
          toContract:
            tx.to === gatekeeperAddress
              ? 'GATEKEEPER'
              : tx.to === tokenCapacitorAddress
              ? 'TOKEN_CAPACITOR'
              : '?',
        };
      }
      // null || custom, decoded log
      return decoded;
    })
    .filter(l => l !== null);
}
