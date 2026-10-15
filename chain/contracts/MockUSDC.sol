// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet-only token with a one-time public faucet. It has no real monetary value.
contract MockUSDC is ERC20 {
    mapping(address => bool) public claimed;
    constructor() ERC20("Contain Demo USDC", "dUSDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function faucet() external {
        require(!claimed[msg.sender], "Already claimed");
        claimed[msg.sender] = true;
        _mint(msg.sender, 1_000 * 10 ** 6);
    }
}
