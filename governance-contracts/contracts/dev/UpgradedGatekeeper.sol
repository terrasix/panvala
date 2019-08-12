pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;


import "../Gatekeeper.sol";
import "../ParameterStore.sol";

/**
 @dev An example upgraded gatekeeper that copies over data on initialization

 For the epoch in which this gatekeeper is deployed, copy:
 startTime, requestCount, slateCount,
 contest details for token capacitor and parameter store,
 for each resource
   winning slate and its associated Requests
   incumbent
*/
contract UpgradedGatekeeper is Gatekeeper {
    Gatekeeper previousGatekeeper;
    bool initialized;
    uint256 epochToTransfer;

    constructor(ParameterStore _parameters, IERC20 _token)
        Gatekeeper(0, _parameters, _token) public {

        // get the old gatekeeper
        address gatekeeperAddress = _parameters.getAsAddress("gatekeeperAddress");
        require(gatekeeperAddress != address(0), "Missing gatekeeper");

        previousGatekeeper = Gatekeeper(gatekeeperAddress);

        // Assume that this gatekeeper is deployed in the same epoch as the one in which
        // the upgrade proposal is made
        epochToTransfer = previousGatekeeper.currentEpochNumber();

        // Keep the same start time
        startTime = previousGatekeeper.startTime();
    }

    function init() public {
        require(initialized == false, "Already initialized");

        // Do not allow initialization until this gatekeeper has been accepted
        address gatekeeperAddress = parameters.getAsAddress("gatekeeperAddress");
        require(gatekeeperAddress == address(this), "Not ready");

        migrateState();

        initialized = true;
    }

    // Functions frozen before initialization
    function depositVoteTokens(uint numTokens) public returns(bool) {
        require(initialized == true, "Not initialized");
        return super.depositVoteTokens(numTokens);
    }

    function stakeTokens(uint256 slateID) public returns(bool) {
        require(initialized == true, "Not initialized");
        return super.stakeTokens(slateID);
    }

    /**
     @dev Migrate state from the previous gatekeeper
     */
    function migrateState() private {
        // Continue from where the previous one left off
        // Note that some of the slates and requests will be uninitialized
        // If you were to use this pattern, then you would need to make sure to get the slates from
        // the appropriate gatekeepers
        slates.length = previousGatekeeper.slateCount();
        requests.length = previousGatekeeper.requestCount();

        // Handle contests we care about
        address capacitor = parameters.getAsAddress("tokenCapacitorAddress");
        migrateContest(epochToTransfer, capacitor);
        migrateContest(epochToTransfer, address(parameters));
    }

    /**
     @dev Transfer accepted requests from the winning slate in the contest
     */
    function migrateContest(uint256 epochNumber, address resource) private {
        uint256 winner = previousGatekeeper.getWinningSlate(epochNumber, resource);

        // update the contest
        ballots[epochNumber].contests[resource].status = ContestStatus.Finalized;
        ballots[epochNumber].contests[resource].winner = winner;

        // winning slate and its reqeusts
        uint256[] memory acceptedRequestIDs = previousGatekeeper.slateRequests(winner);
        slates[winner].requests = acceptedRequestIDs;

        uint256 numRequests = acceptedRequestIDs.length;
        for (uint256 i = 0; i < numRequests; i++) {
           uint256 requestID = acceptedRequestIDs[i];
           (
               bytes memory metadataHash,
               address _resource,
               bool approved,
               uint256 expirationTime,
               // skip: epochNumber
           ) = previousGatekeeper.requests(requestID);

           requests[requestID] = Request({
               metadataHash: metadataHash,
               resource: _resource,
               approved: approved,
               expirationTime: expirationTime,
               epochNumber: epochNumber
           });
        }

        // incumbent
        incumbent[resource] = previousGatekeeper.incumbent(resource);
    }
}
