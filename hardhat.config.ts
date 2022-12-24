import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  gasReporter: {
    enabled: true,
  },
  networks: {
    hardhat: {
      blockGasLimit: 2000000000,
    },
  },
};

export default config;
