const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account available. Set DEPLOYER_PRIVATE_KEY in your environment."
    );
  }

  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    (await deployer.provider.getBalance(deployer.address)).toString()
  );

  // Get USDC address from env or use deployed address
  const usdcAddress = process.env.USDC_ADDRESS;
  if (!usdcAddress) {
    throw new Error("USDC_ADDRESS not set in environment. Deploy USDC first using deploy-usdc.cjs");
  }

  console.log("Using USDC at:", usdcAddress);

  // Deploy Factory
  console.log("\n=== Deploying BrimdexParimutuelMarketFactory ===");
  const Factory = await hre.ethers.getContractFactory("BrimdexParimutuelMarketFactory");
  const factory = await Factory.deploy(usdcAddress, deployer.address);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("Factory deployed to:", factoryAddress);

  // Deploy Library first (OrderBookLinkedList needs linking)
  console.log("\n=== Deploying OrderBookLinkedList Library ===");
  const OrderBookLinkedList = await hre.ethers.getContractFactory("OrderBookLinkedList");
  const orderBookLinkedList = await OrderBookLinkedList.deploy();
  await orderBookLinkedList.waitForDeployment();
  const orderBookLinkedListAddress = await orderBookLinkedList.getAddress();
  console.log("OrderBookLinkedList deployed to:", orderBookLinkedListAddress);

  // Deploy OrderBook with linked library
  console.log("\n=== Deploying BrimdexParimutuelOrderBook ===");
  const OrderBook = await hre.ethers.getContractFactory("BrimdexParimutuelOrderBook", {
    libraries: {
      OrderBookLinkedList: orderBookLinkedListAddress,
    },
  });
  const orderBook = await OrderBook.deploy(usdcAddress, factoryAddress, deployer.address);
  await orderBook.waitForDeployment();
  const orderBookAddress = await orderBook.getAddress();
  console.log("OrderBook deployed to:", orderBookAddress);

  // Save deployment addresses
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    usdc: usdcAddress,
    factory: factoryAddress,
    orderBook: orderBookAddress,
    libraries: {
      OrderBookLinkedList: orderBookLinkedListAddress,
    },
    timestamp: new Date().toISOString()
  };

  console.log("\n=== Deployment Summary ===");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Optionally save to file
  const fs = require("fs");
  const deploymentsFile = "deployments.json";
  let deployments = {};
  if (fs.existsSync(deploymentsFile)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  }
  deployments[hre.network.name] = deploymentInfo;
  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));
  console.log(`\nDeployment info saved to ${deploymentsFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
