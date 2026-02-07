require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const SOMNIA_TESTNET_RPC_URL =
  process.env.SOMNIA_TESTNET_RPC_URL || "https://dream-rpc.somnia.network";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: { 
          optimizer: { enabled: true, runs: 200 },
          viaIR: true
        },
      },
      {
        version: "0.8.30",
        settings: { 
          optimizer: { enabled: true, runs: 200 },
          viaIR: true
        },
      },
    ],
    overrides: {
      "contracts/BlockTickHandler.sol": {
        version: "0.8.30",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true
        }
      }
    }
  },
  networks: {
    somniaTestnet: {
      url: SOMNIA_TESTNET_RPC_URL,
      chainId: 50312,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

