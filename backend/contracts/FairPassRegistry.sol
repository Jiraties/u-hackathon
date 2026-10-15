// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Walletless, nontransferable admission registry. No student PII or scores.
/// @dev Result authority authenticates external outcomes and confirmations. It does
/// not prove allocation correctness. Use fresh opaque identifiers for each round.
contract FairPassRegistry is AccessControlDefaultAdminRules, Pausable {
    bytes32 public constant RESULT_AUTHORITY = keccak256("RESULT_AUTHORITY");
    bytes32 public constant GUARDIAN = keccak256("GUARDIAN");
    enum Status { Missing, Active, Enrolled, Withdrawn, Revoked }
    struct Program {
        address issuer;
        uint32 year;
        uint32 capacity;
        uint32 active;
        uint32 issued;
        uint32 available;
        bytes32 rules;
        uint64 lockedAt;
    }
    // Public result projection contains only a salted commitment and timestamp.
    // Outcome and subject binding are stored privately and used by contract logic.
    struct Result {
        bytes32 commitment;
        bytes32 subject;
        bytes32 program;
        uint32 year;
        bool admitted;
        bool confirmed;
        bool consumed;
        uint64 recordedAt;
    }
    struct Right {
        bytes32 program;
        bytes32 resultId;
        bytes32 subject;
        uint32 year;
        Status status;
    }
    mapping(address => bool) public institutions;
    mapping(bytes32 => Program) public programs;
    mapping(bytes32 => Result) private results;
    mapping(bytes32 => Right) private rights;
    mapping(bytes32 => bytes32) public activeRight;

    error Invalid(); error Unauthorized(); error Exists(); error Missing();
    error Locked(); error Capacity(); error Transition();
    event InstitutionAuthorized(address indexed issuer, bool enabled);
    event ProgramRegistered(bytes32 indexed program, address indexed issuer, uint32 year, uint32 capacity, bytes32 rules);
    event RulesRevised(bytes32 indexed program, bytes32 previousRules, bytes32 newRules, bytes32 reason);
    event RulesLocked(bytes32 indexed program, bytes32 rules);
    event CapacityChanged(bytes32 indexed program, uint32 oldCapacity, uint32 newCapacity, bytes32 reason);
    event ResultRecorded(bytes32 indexed resultId, bytes32 commitment);
    event ConfirmationRecorded(bytes32 indexed resultId);
    event RightIssued(bytes32 indexed credentialId, bytes32 indexed program);
    event StatusChanged(bytes32 indexed credentialId, bytes32 indexed program, Status status, bytes32 reason);
    event ReallocationAuthorized(bytes32 indexed program, uint32 seats, bytes32 reason);

    constructor(address admin, address authority) AccessControlDefaultAdminRules(2 days, admin) {
        if (authority == address(0)) revert Invalid();
        _grantRole(RESULT_AUTHORITY, authority);
        _grantRole(GUARDIAN, admin);
    }
    function authorizeInstitution(address issuer, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (issuer == address(0)) revert Invalid();
        institutions[issuer] = enabled;
        emit InstitutionAuthorized(issuer, enabled);
    }
    function pause() external onlyRole(GUARDIAN) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
    function registerProgram(bytes32 id, uint32 year, uint32 capacity, bytes32 rules) external whenNotPaused {
        if (!institutions[msg.sender]) revert Unauthorized();
        if (id == 0 || year == 0 || capacity == 0 || rules == 0) revert Invalid();
        if (programs[id].issuer != address(0)) revert Exists();
        programs[id] = Program(msg.sender, year, capacity, 0, 0, capacity, rules, 0);
        emit ProgramRegistered(id, msg.sender, year, capacity, rules);
    }
    function _issuer(bytes32 id) internal view {
        if (programs[id].issuer == address(0)) revert Missing();
        if (programs[id].issuer != msg.sender || !institutions[msg.sender]) revert Unauthorized();
    }
    /// @notice Capacity can change only before rules lock. A new cycle needs a new program ID.
    function reviseProgram(bytes32 id, uint32 capacity, bytes32 rules, bytes32 reason) external whenNotPaused {
        _issuer(id);
        Program storage p = programs[id];
        if (p.lockedAt != 0) revert Locked();
        if (capacity == 0 || rules == 0 || reason == 0) revert Invalid();
        emit CapacityChanged(id, p.capacity, capacity, reason);
        emit RulesRevised(id, p.rules, rules, reason);
        p.capacity = capacity; p.available = capacity; p.rules = rules;
    }
    function lockRules(bytes32 id) external whenNotPaused {
        _issuer(id);
        Program storage p = programs[id];
        if (p.lockedAt != 0) revert Locked();
        p.lockedAt = uint64(block.timestamp);
        emit RulesLocked(id, p.rules);
    }
    function recordResult(bytes32 id, bytes32 commitment, bytes32 subject, bytes32 program, uint32 year, bool admitted)
        external onlyRole(RESULT_AUTHORITY) whenNotPaused {
        if (id == 0 || commitment == 0 || subject == 0 || year == 0) revert Invalid();
        if (results[id].recordedAt != 0) revert Exists();
        if (admitted) {
            Program storage p = programs[program];
            if (p.lockedAt == 0 || p.year != year || !institutions[p.issuer]) revert Invalid();
        } else if (program != 0) revert Invalid();
        results[id] = Result(commitment, subject, program, year, admitted, false, false, uint64(block.timestamp));
        emit ResultRecorded(id, commitment);
    }
    /// @dev Authority must authenticate the student's consent off-chain.
    function confirmResult(bytes32 id) external onlyRole(RESULT_AUTHORITY) whenNotPaused {
        Result storage r = results[id];
        if (r.recordedAt == 0 || !r.admitted || r.confirmed) revert Transition();
        r.confirmed = true;
        emit ConfirmationRecorded(id);
    }
    function issueRight(bytes32 id, bytes32 resultId) external whenNotPaused {
        Result storage r = results[resultId];
        _issuer(r.program);
        if (id == 0) revert Invalid();
        if (rights[id].status != Status.Missing) revert Exists();
        if (!r.confirmed || r.consumed) revert Transition();
        Program storage p = programs[r.program];
        bytes32 binding = keccak256(abi.encode(r.subject, r.year));
        if (activeRight[binding] != 0) revert Exists();
        if (p.active >= p.capacity || p.available == 0) revert Capacity();
        r.consumed = true; p.active++; p.issued++; p.available--;
        activeRight[binding] = id;
        rights[id] = Right(r.program, resultId, r.subject, r.year, Status.Active);
        emit RightIssued(id, r.program);
    }
    function changeStatus(bytes32 id, Status status, bytes32 reason) external whenNotPaused {
        Right storage r = rights[id];
        _issuer(r.program);
        if (r.status != Status.Active && r.status != Status.Enrolled) revert Transition();
        if (status != Status.Enrolled && status != Status.Withdrawn && status != Status.Revoked) revert Transition();
        if (status == r.status || reason == 0) revert Transition();
        if (status == Status.Withdrawn || status == Status.Revoked) {
            programs[r.program].active--;
            delete activeRight[keccak256(abi.encode(r.subject, r.year))];
            // Deliberately do not replenish issuance allowance on withdrawal.
        }
        r.status = status;
        emit StatusChanged(id, r.program, status, reason);
    }
    function authorizeReallocation(bytes32 id, uint32 seats, bytes32 reason) external whenNotPaused {
        _issuer(id);
        Program storage p = programs[id];
        if (p.lockedAt == 0 || seats == 0 || reason == 0 || uint256(p.active) + p.available + seats > p.capacity) revert Capacity();
        p.available += seats;
        emit ReallocationAuthorized(id, seats, reason);
    }
    function isConfirmed(bytes32 id) external view returns (bool) { return results[id].confirmed; }
    function resultCommitment(bytes32 id) external view returns (bytes32 commitment, uint64 recordedAt) {
        Result storage r = results[id]; return (r.commitment, r.recordedAt);
    }
    function credential(bytes32 id) external view returns (bytes32 program, Status status, address issuer, uint32 year) {
        Right storage r = rights[id];
        return (r.program, r.status, programs[r.program].issuer, r.year);
    }
}
