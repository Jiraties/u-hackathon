// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {FairPassRegistry} from "./FairPassRegistry.sol";
interface IScoringVerifier { function verify(bytes calldata proof, bytes32[] calldata inputs) external view returns (bool); }
/// @notice Authenticated private scoring. Allocation correctness is outside this proof.
contract FairPassRegistryV2 is FairPassRegistry {
    bytes32 public constant EXAM_AUTHORITY = keccak256("EXAM_AUTHORITY");
    uint256 private constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    IScoringVerifier public immutable scoringVerifier;
    struct Policy { bytes32 intake; uint32 round; uint32 version; uint32[3] subjects; uint32[3] weights; uint32[3] minimums; }
    struct Dataset { uint256 root; uint32 year; uint32 round; uint32 version; uint64 expiresAt; address authority; bool revoked; }
    struct ScoreClaim { bytes32 subject; bytes32 dataset; bytes32 rules; bytes32 nullifier; bytes32 totalCommitment; bool eligible; uint64 verifiedAt; }
    mapping(bytes32 => Policy) private policies;
    mapping(bytes32 => bytes32) public scoringRulesHash;
    mapping(bytes32 => bytes32) public intakeHead;
    mapping(bytes32 => Dataset) public datasets;
    mapping(bytes32 => bytes32) public latestDataset;
    mapping(bytes32 => mapping(bytes32 => ScoreClaim)) public scoreClaims;
    mapping(bytes32 => bool) public usedNullifiers;
    event ScoringPolicyRegistered(bytes32 indexed program, bytes32 indexed intake, uint32 version, bytes32 policyHash, bytes32 previous);
    event ExamDatasetCommitted(bytes32 indexed dataset, uint256 root, uint32 year, uint32 round, uint32 version, address authority, uint64 expiresAt);
    event ExamDatasetRevoked(bytes32 indexed dataset);
    event ScoringVerified(bytes32 indexed resultId, bytes32 indexed program, bytes32 dataset, bytes32 nullifier, bytes32 totalCommitment, bool eligible);
    error ProofRequired(); error InvalidProof(); error UnsupportedPolicy(); error StaleDataset(); error Replay();
    constructor(address admin, address allocationAuthority, address examAuthority, address verifier) FairPassRegistry(admin, allocationAuthority) {
        if (examAuthority == address(0) || verifier.code.length == 0) revert Invalid();
        scoringVerifier = IScoringVerifier(verifier); _grantRole(EXAM_AUTHORITY, examAuthority);
    }
    function protocolVersion() external pure returns (uint256) { return 2; }
    function registerProgram(bytes32, uint32, uint32, bytes32) external pure override { revert UnsupportedPolicy(); }
    function reviseProgram(bytes32, uint32, bytes32, bytes32) external pure override { revert UnsupportedPolicy(); }
    function scoringPolicy(bytes32 program) external view returns (Policy memory) { return policies[program]; }
    function policyHash(uint32 year, uint32 capacity, Policy calldata p) public pure returns (bytes32) {
        return sha256(abi.encode(uint256(1), p.intake, year, capacity, p.round, p.version, p.subjects, p.weights, p.minimums));
    }
    function registerScoringProgram(bytes32 id, uint32 year, uint32 capacity, bytes32 metadataHash, Policy calldata policy) external whenNotPaused {
        if (policy.intake == 0 || policy.round == 0 || policy.version == 0 || year < 2020 || year > 2100 || capacity > 10000) revert UnsupportedPolicy();
        if (id != sha256(abi.encode(policy.intake, policy.version))) revert Invalid();
        bytes32 previous = intakeHead[policy.intake];
        if (previous == 0) { if (policy.version != 1) revert Invalid(); }
        else {
            _issuer(previous);
            if (programs[previous].issued != 0 || programs[previous].year != year || policies[previous].round != policy.round || policy.version != policies[previous].version + 1) revert Locked();
        }
        uint256 total;
        for (uint256 i; i < 3; ++i) {
            if (policy.subjects[i] == 0 || policy.weights[i] == 0 || policy.weights[i] > 10000 || policy.minimums[i] > 10000) revert UnsupportedPolicy();
            for (uint256 j; j < i; ++j) if (policy.subjects[i] == policy.subjects[j]) revert UnsupportedPolicy();
            total += policy.weights[i];
        }
        if (total != 10000) revert UnsupportedPolicy();
        _registerProgram(id, year, capacity, metadataHash);
        policies[id] = policy; intakeHead[policy.intake] = id;
        bytes32 hash = policyHash(year, capacity, policy); scoringRulesHash[id] = hash;
        emit ScoringPolicyRegistered(id, policy.intake, policy.version, hash, previous);
    }
    function _datasetContext(uint32 year, uint32 round) private pure returns (bytes32) { return keccak256(abi.encode(year, round)); }
    function commitExamDataset(bytes32 id, uint256 root, uint32 year, uint32 round, uint32 version, uint64 expiresAt) external onlyRole(EXAM_AUTHORITY) whenNotPaused {
        if (id == 0 || root == 0 || root >= FIELD || year < 2020 || year > 2100 || round == 0 || version == 0 || expiresAt <= block.timestamp) revert Invalid();
        if (datasets[id].root != 0) revert Exists();
        bytes32 context = _datasetContext(year, round);
        Dataset storage previous = datasets[latestDataset[context]];
        if (version != previous.version + 1) revert Invalid();
        datasets[id] = Dataset(root, year, round, version, expiresAt, msg.sender, false);
        latestDataset[context] = id;
        emit ExamDatasetCommitted(id, root, year, round, version, msg.sender, expiresAt);
    }
    function revokeExamDataset(bytes32 id) external onlyRole(EXAM_AUTHORITY) whenNotPaused {
        if (datasets[id].root == 0) revert Missing(); datasets[id].revoked = true; emit ExamDatasetRevoked(id);
    }
    function _currentDataset(bytes32 id) private view returns (Dataset storage d) {
        d = datasets[id];
        if (d.root == 0 || d.revoked || d.expiresAt <= block.timestamp || !hasRole(EXAM_AUTHORITY, d.authority) || latestDataset[_datasetContext(d.year, d.round)] != id) revert StaleDataset();
    }
    function _halves(bytes32 value) private pure returns (bytes32, bytes32) { return (bytes32(uint256(value) >> 128), bytes32(uint256(value) & type(uint128).max)); }
    function scoringInputs(bytes32 resultId, bytes32 program, bytes32 dataset, bytes32 subject, bytes32 nullifier, bytes32 totalCommitment, bool eligible) public view returns (bytes32[] memory pi) {
        Dataset storage d = _currentDataset(dataset); Policy storage p = policies[program];
        if (programs[program].lockedAt == 0 || !institutions[programs[program].issuer] || intakeHead[p.intake] != program || d.year != programs[program].year || d.round != p.round || subject == 0 || resultId == 0 || uint256(nullifier) == 0 || uint256(nullifier) >= FIELD || uint256(totalCommitment) == 0 || uint256(totalCommitment) >= FIELD) revert Invalid();
        pi = new bytes32[](27);
        pi[0] = bytes32(block.chainid); pi[1] = bytes32(uint256(uint160(address(this)))); pi[2] = bytes32(d.root);
        pi[3] = bytes32(uint256(d.year)); pi[4] = bytes32(uint256(d.round)); pi[5] = bytes32(uint256(d.version));
        (pi[6], pi[7]) = _halves(program); pi[8] = bytes32(uint256(p.version));
        (pi[9], pi[10]) = _halves(scoringRulesHash[program]); (pi[11], pi[12]) = _halves(resultId); (pi[13], pi[14]) = _halves(subject);
        pi[15] = nullifier; pi[16] = totalCommitment; pi[17] = eligible ? bytes32(uint256(1)) : bytes32(0);
        for (uint256 i; i < 3; ++i) { pi[18+i] = bytes32(uint256(p.subjects[i])); pi[21+i] = bytes32(uint256(p.weights[i])); pi[24+i] = bytes32(uint256(p.minimums[i])); }
    }
    function verifyScoring(bytes32 resultId, bytes32 program, bytes32 dataset, bytes32 subject, bytes32 nullifier, bytes32 totalCommitment, bool eligible, bytes calldata proof) external whenNotPaused {
        if ((scoreClaims[resultId][program].verifiedAt != 0 && scoreClaims[resultId][program].dataset == dataset) || usedNullifiers[nullifier]) revert Replay();
        if (!scoringVerifier.verify(proof, scoringInputs(resultId, program, dataset, subject, nullifier, totalCommitment, eligible))) revert InvalidProof();
        usedNullifiers[nullifier] = true;
        scoreClaims[resultId][program] = ScoreClaim(subject, dataset, scoringRulesHash[program], nullifier, totalCommitment, eligible, uint64(block.timestamp));
        emit ScoringVerified(resultId, program, dataset, nullifier, totalCommitment, eligible);
    }
    function _beforeIssue(bytes32 resultId, Result storage result) internal view override {
        ScoreClaim storage claim = scoreClaims[resultId][result.program];
        if (claim.verifiedAt == 0 || !claim.eligible || claim.subject != result.subject || claim.rules != scoringRulesHash[result.program] || intakeHead[policies[result.program].intake] != result.program) revert ProofRequired();
        _currentDataset(claim.dataset);
    }
}
