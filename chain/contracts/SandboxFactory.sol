// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ContainSandbox} from "./ContainSandbox.sol";

contract SandboxFactory {
    event SandboxCreated(address indexed owner, address indexed sandbox, address indexed token, uint256 amount);

    function createSandbox(IERC20 token, uint256 amount) external returns (address sandbox) {
        sandbox = address(new ContainSandbox(msg.sender, token, amount));
        emit SandboxCreated(msg.sender, sandbox, address(token), amount);
    }
}
