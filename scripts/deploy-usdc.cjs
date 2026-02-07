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

  const name = process.env.USDC_NAME || "USD Coin";
  const symbol = process.env.USDC_SYMBOL || "USDC";

  const USDC = await hre.ethers.getContractFactory("USDC");
  const usdc = await USDC.deploy(name, symbol, deployer.address);
  await usdc.waitForDeployment();

  const usdcAddress = await usdc.getAddress();
  console.log("USDC deployed to:", usdcAddress);

  // Mint to deployer by default (USDC has 6 decimals)
  const mintTo = process.env.MINT_TO || deployer.address;
  const mintAmount = process.env.MINT_AMOUNT || "1000000"; // Default: 1,000,000 USDC
  const amount = hre.ethers.parseUnits(mintAmount, 6);
  const tx = await usdc.mint(mintTo, amount);
  await tx.wait();
  console.log(`Minted ${mintAmount} ${symbol} to ${mintTo}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

