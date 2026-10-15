// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice DEMO ONLY. Single-use ERC20 funding, owner-directed calls from an isolated address.
/// @dev This isolates the owner's existing balance; it is NOT a universal $20 oracle-based risk cap.
contract ContainSandbox is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable owner;
    IERC20 public immutable budgetToken;
    uint256 public immutable initialBudget;
    bool public funded;

    event Funded(address indexed owner, uint256 amount);
    event Executed(address indexed target, bytes4 selector);
    event Withdrawn(address indexed token, uint256 amount);

    error NotOwner();
    error AlreadyFunded();
    error NotFunded();
    error ZeroAddress();
    error ExternalCallFailed(bytes reason);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _owner, IERC20 _token, uint256 _amount) {
        if (_owner == address(0) || address(_token) == address(0) || _amount == 0) revert ZeroAddress();
        owner = _owner;
        budgetToken = _token;
        initialBudget = _amount;
    }

    /// @notice Only pulls 20 mock USDC once, after explicit limited ERC20 approval.
    function fund() external onlyOwner nonReentrant {
        if (funded) revert AlreadyFunded();
        funded = true;
        budgetToken.safeTransferFrom(owner, address(this), initialBudget);
        emit Funded(owner, initialBudget);
    }

    /// @notice Execute a dApp call as the sandbox address, NOT as the owner's EOA.
    /// @dev No ETH forwarding in this demo; do not send ETH to this contract.
    function execute(address target, bytes calldata callData)
        external onlyOwner nonReentrant returns (bytes memory response)
    {
        if (!funded) revert NotFunded();
        if (target == address(0)) revert ZeroAddress();
        (bool ok, bytes memory data) = target.call(callData);
        if (!ok) revert ExternalCallFailed(data);
        bytes4 selector;
        if (callData.length >= 4) {
            assembly { selector := calldataload(callData.offset) }
        }
        emit Executed(target, selector);
        return data;
    }

    /// @notice Recover unencumbered tokens. Existing approvals can still drain future deposits!
    function withdrawToken(IERC20 token) external onlyOwner nonReentrant {
        uint256 amount = token.balanceOf(address(this));
        token.safeTransfer(owner, amount);
        emit Withdrawn(address(token), amount);
    }
}
