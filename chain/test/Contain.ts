import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { encodeFunctionData, maxUint256 } from "viem";

const { viem } = await network.create();

describe("Contain isolation attack demo", () => {
  it("drains only the sandbox, leaving the main wallet untouched", async () => {
    const [owner, attacker] = await viem.getWalletClients();
    const token = await viem.deployContract("MockUSDC");
    const factory = await viem.deployContract("SandboxFactory");
    const drainer = await viem.deployContract("DemoDrainer");
    await token.write.faucet();
    const budget = 20n * 10n ** 6n;

    const tx = await factory.write.createSandbox([token.address, budget]);
    const publicClient = await viem.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    const log = receipt.logs.find(l => l.address.toLowerCase() === factory.address.toLowerCase());
    assert.ok(log);
    const { decodeEventLog } = await import("viem");
    const event = decodeEventLog({ abi: factory.abi, data: log.data, topics: log.topics });
    assert.equal(event.eventName, "SandboxCreated");
    const sandboxAddress = (event.args as { sandbox: `0x${string}` }).sandbox;

    await token.write.approve([sandboxAddress, budget]);
    const sandbox = await viem.getContractAt("ContainSandbox", sandboxAddress);
    await sandbox.write.fund();

    assert.equal(await token.read.balanceOf([owner.account.address]), 980n * 10n ** 6n);
    assert.equal(await token.read.allowance([owner.account.address, sandboxAddress]), 0n);

    const badApproval = encodeFunctionData({
      abi: token.abi, functionName: "approve", args: [drainer.address, maxUint256]
    });
    await sandbox.write.execute([token.address, badApproval]);
    await drainer.write.drain([token.address, sandboxAddress, budget], { account: attacker.account });
    // The same attacker cannot use the sandbox approval to drain main-wallet tokens.
    await assert.rejects(drainer.write.drain([token.address, owner.account.address, budget], { account: attacker.account }));

    assert.equal(await token.read.balanceOf([sandboxAddress]), 0n);
    assert.equal(await token.read.balanceOf([owner.account.address]), 980n * 10n ** 6n);
    assert.equal(await token.read.balanceOf([drainer.address]), budget);
    await assert.rejects(sandbox.write.execute([token.address, badApproval], { account: attacker.account }));
    await assert.rejects(sandbox.write.fund());
  });
});
