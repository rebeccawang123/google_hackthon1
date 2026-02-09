
import { ethers } from "ethers";
import { db } from "./dbService";

const RPC_URL = 'https://sepolia.base.org';
const REGISTRY_ADDRESS = '0x8004aa63c570c570ebf15376c0db199918bfe9fb';
const USDC_ADDRESS = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
export const REPUTATION_ADDRESS = '0x8004bd8daB57f14Ed299135749a5CB5c42d341BF';

const REGISTRY_ABI = [
  "function register(string agentURI) public returns (bool)",
  "function isRegistered(address identity) public view returns (bool)",
  "function getAgentId(address identity) public view returns (uint256)",
  "function balanceOf(address owner) public view returns (uint256)",
  "function ownerOf(uint256 tokenId) public view returns (address)"
];

const REPUTATION_ABI = [
  "function giveFeedback(uint256 agentId, uint8 score, bytes32 tag1, bytes32 tag2, string calldata feedbackUri, bytes32 feedbackHash, bytes calldata feedbackAuth) external",
  "function getSummary(uint256 agentId, address[] calldata clientAddresses, bytes32 tag1, bytes32 tag2) public view returns (uint64 count, uint8 averageScore)",
  "function hasRated(address auditor, address target) public view returns (bool)"
];

const USDC_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const getProvider = () => new ethers.JsonRpcProvider(RPC_URL, undefined, {
  staticNetwork: true
});

export const getDetailedRegistrationStatus = async (address: string) => {
  try {
    const provider = getProvider();
    const contract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
    const [isReg, balance, agentId] = await Promise.all([
      contract.isRegistered(address).catch(() => false),
      contract.balanceOf(address).catch(() => 0n),
      contract.getAgentId(address).catch(() => 0n)
    ]);
    const active = isReg || agentId > 0n || balance > 0n;
    return { 
      protocolActive: active, 
      hasToken: balance > 0n, 
      agentId: Number(agentId), 
      needsSync: (balance > 0n || agentId > 0n) && !isReg 
    };
  } catch (e) {
    return { protocolActive: false, hasToken: false, agentId: 0, needsSync: false };
  }
};

export const checkRegistrationStatus = async (address: string, agentId?: number): Promise<boolean> => {
  const status = await getDetailedRegistrationStatus(address);
  return status.protocolActive || (!!agentId && agentId > 0);
};

export const registerIdentityOnChain = async (privateKey: string, agentURI: string): Promise<string> => {
  const provider = getProvider();
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);

  try {
    const tx = await contract.register(agentURI, { gasLimit: 800000 });
    const receipt = await tx.wait();
    return receipt?.hash || "";
  } catch (err: any) {
    const msg = err.reason || err.message || "";
    if (msg.includes("already registered")) return "0x_ALREADY_ACTIVE";
    throw err;
  }
};

export const getAddressBalance = async (address: string): Promise<string> => {
  try {
    const balance = await getProvider().getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    return '0.0';
  }
};

export const getUsdcBalance = async (address: string): Promise<string> => {
  try {
    const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, getProvider());
    const balance = await contract.balanceOf(address);
    return ethers.formatUnits(balance, 6);
  } catch (error) {
    return '0.0';
  }
};

export const getExplorerUrl = (hashOrAddress: string, type: 'tx' | 'address' = 'address'): string => {
  const baseUrl = 'https://sepolia.basescan.org';
  return type === 'tx' ? `${baseUrl}/tx/${hashOrAddress}` : `${baseUrl}/address/${hashOrAddress}`;
};

/**
 * 核心查询函数：调用合约 getSummary
 */
export const getAgentReputation = async (address: string, providedAgentId?: number) => {
  try {
    const provider = getProvider();
    let agentId: bigint = 0n;

    if (providedAgentId && providedAgentId > 0) {
      agentId = BigInt(providedAgentId);
    } else {
      const local = await db.findByAddress(address);
      const localId = local?.agentId || local?.metadata?.agentId;
      if (localId && localId > 0) {
        agentId = BigInt(localId);
      } else {
        const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
        agentId = await registry.getAgentId(address).catch(() => 0n);
      }
    }

    if (agentId === 0n) {
      return { average: 0, count: 0 };
    }

    const reputation = new ethers.Contract(REPUTATION_ADDRESS, REPUTATION_ABI, provider);
    const result = await reputation.getSummary(agentId, [], ethers.ZeroHash, ethers.ZeroHash);
    
    const count = Number(result[0]);
    const average = Number(result[1]);
    
    return { average, count };
  } catch (error) {
    console.error("Query summary reputation failed:", error);
    return { average: 0, count: 0 };
  }
};

/**
 * API 对接函数：通过 Email 获取评分
 * 返回格式：{ score: number }
 */
export const getReputationByEmail = async (email: string) => {
  const identity = await db.findByEmail(email);
  if (!identity) {
    throw new Error("NOT_FOUND: 身份未在 Vault 中激活。");
  }
  const result = await getAgentReputation(identity.address, identity.agentId);
  return { score: result.average };
};

export const checkHasRated = async (auditor: string, target: string): Promise<boolean> => {
  try {
    const contract = new ethers.Contract(REPUTATION_ADDRESS, REPUTATION_ABI, getProvider());
    return await contract.hasRated(ethers.getAddress(auditor), ethers.getAddress(target));
  } catch (e) {
    return false;
  }
};

export const rateAgent = async (
  raterPrivateKey: string, 
  targetAddress: string, 
  score: number, 
  comment: string, 
  targetAgentId?: number
): Promise<string> => {
  const provider = getProvider();
  const raterWallet = new ethers.Wallet(raterPrivateKey, provider);
  
  const targetIdentity = await db.findByAddress(targetAddress);
  if (!targetIdentity) {
    throw new Error("TARGET_KEY_NOT_FOUND: 本地 Vault 未找到目标身份。");
  }
  const targetWallet = new ethers.Wallet(targetIdentity.privateKey);

  let finalTargetId: bigint = targetAgentId ? BigInt(targetAgentId) : 0n;
  if (!finalTargetId || finalTargetId === 0n) {
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
    finalTargetId = await registry.getAgentId(targetAddress).catch(() => 0n);
  }

  if (!finalTargetId || finalTargetId === 0n) {
    throw new Error("TARGET_NOT_REGISTERED: 目标代理尚未在协议中激活。");
  }

  const reputationContract = new ethers.Contract(REPUTATION_ADDRESS, REPUTATION_ABI, raterWallet);
  
  const _score = Math.floor(Math.max(0, Math.min(score, 100)));
  const _tag1 = ethers.encodeBytes32String("agent");
  const _tag2 = ethers.encodeBytes32String("test");
  const _uri = comment;
  const _hash = ethers.keccak256(ethers.toUtf8Bytes(_uri));

  const expiry = BigInt(Math.floor(Date.now() / 1000) + 7200); 
  const chainId = 84532n;
  const indexLimit = 1000000n;
  
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encodedAuthData = coder.encode(
    ["uint256", "address", "uint64", "uint256", "uint256", "address", "address"],
    [finalTargetId, raterWallet.address, indexLimit, expiry, chainId, REGISTRY_ADDRESS, targetWallet.address]
  );

  const rawHash = ethers.keccak256(encodedAuthData);
  const signature = await targetWallet.signMessage(ethers.getBytes(rawHash));

  const _auth = ethers.concat([encodedAuthData, signature]);

  try {
    const gasEstimate = await reputationContract.giveFeedback.estimateGas(
      finalTargetId, _score, _tag1, _tag2, _uri, _hash, _auth
    ).catch(() => 1500000n);

    const tx = await reputationContract.giveFeedback(
      finalTargetId, _score, _tag1, _tag2, _uri, _hash, _auth,
      { gasLimit: (gasEstimate * 15n) / 10n }
    );

    const receipt = await tx.wait();
    if (!receipt || receipt.status === 0) throw new Error("Broadcast Reverted.");
    return receipt.hash;
  } catch (err: any) {
    console.error("Protocol Interaction Error:", err);
    throw new Error(err.reason || err.message || "Feedback validation failed.");
  }
};

export const sendEthTransaction = async (privateKey: string, to: string, amount: string): Promise<string> => {
  const provider = getProvider();
  const wallet = new ethers.Wallet(privateKey, provider);
  const tx = await wallet.sendTransaction({ to, value: ethers.parseEther(amount), gasLimit: 120000 });
  await tx.wait();
  return tx.hash;
};

export const sendUsdcTransaction = async (privateKey: string, to: string, amount: string): Promise<string> => {
  const provider = getProvider();
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
  const tx = await contract.transfer(to, ethers.parseUnits(amount, 6), { gasLimit: 150000 });
  await tx.wait();
  return tx.hash;
};

