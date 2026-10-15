import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ContainDemo", (m) => {
  const token = m.contract("MockUSDC");
  const factory = m.contract("SandboxFactory");
  const drainer = m.contract("DemoDrainer");
  return { token, factory, drainer };
});
