import {
  createPublicClient,
  http,
  parseAbi,
  fallback,
  type PublicClient,
} from "viem";
import { sepolia } from "viem/chains";
export const CHAIN_ID = 11155111;
export const CORE = "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4" as const;
export const IMPLEMENTATION =
  "0x6869d6102696243fd17013ab955d99cd0c522ad3" as const;
export const RUNTIME_HASH =
  "0x65b5780a4fccafedeca1260806364d2bb512b4501c097253f792ae2839565a9c" as const;
export const LAYOUT =
  "0x9a9c008e029460808209571703fbf2679785874e0e6d3232f16a864d12abcb20" as const;
export const PROXY_ADMIN =
  "0x21b3cb8f00d0d47b246a57d04152d6e11d24abb3" as const;
export const TIMELOCK = "0xaa2e9621de9ac23cbb36d1a1bac4c8b0694cc30d" as const;
export const STREAM =
  "0xa78faebd5aad38b4f90c7f61b9c5c10e8d9b9afe74ebfc2e82ca98b7e57ed562" as const;
export const RELEASE = "core-sepolia-20261103";
export const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const EXPLORER = "https://sepolia.etherscan.io";
export const API = "https://api.squeekchain.com/v1";
export const CONFIRMATIONS = 12n;
export const coreAbi = parseAbi([
  "function state() view returns ((uint64 settledThroughRound, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint64 blockHeight, uint96 blockProgress, uint32 workPerThousandBlocks, uint256 authorizationNonce, bool paused))",
  "function roundPage(uint64 afterRound,uint64 throughRound,uint256 maxRecords) view returns ((uint64 certifiedThroughRound,(uint64 cumulativeWork,uint96 cumulativeBlockUnits,uint32 workPerThousandBlocks) start,(uint64 cumulativeWork,uint96 cumulativeBlockUnits,uint32 workPerThousandBlocks) end,(uint64 roundId,uint64 cumulativeWork,uint96 cumulativeBlockUnits,uint32 workPerThousandBlocks,bytes32 dataHash)[] rounds))",
  "function blockInfo(uint64 squeekBlock) view returns ((uint64 roundId,uint64 workThreshold))",
  "function configuration() view returns ((bytes32 streamId,uint64 genesisTimestamp,uint64 roundDuration,uint64 maxWorkPerRound,uint16 maxRoundsPerBatch,address guardian,address reporter,uint32 initialWorkPerThousandBlocks,uint64 targetBlocksPerActiveRound,uint64 difficultySmoothingRounds,uint96 blockUnitsPerBlock))",
  "function implementationCodeAddress() view returns (address)",
  "function implementationStorageLayoutDigest() view returns (bytes32)",
  "event RoundRecorded(uint64 indexed roundId,uint64 work,uint64 cumulativeWork,uint96 cumulativeBlockUnits,uint32 workPerThousandBlocks,bytes32 dataHash)",
  "event BatchSettled(bytes32 indexed digest,address indexed reporter,uint64 indexed settledThroughRound,uint256 nonce,uint64 previousSettledThroughRound,uint16 activeRoundCount,uint64 cumulativeWork,uint96 cumulativeBlockUnits)",
]);
export const publicClient = createPublicClient({
  chain: sepolia,
  transport: fallback([
    http(RPC_URL, { timeout: 12000, retryCount: 0 }),
    http("https://rpc.sepolia.org", { timeout: 12000, retryCount: 0 }),
  ]),
}) as PublicClient;
