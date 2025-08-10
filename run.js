const { ethers, utils } = require("ethers");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

const RPC_URL = "https://rpc.testnet.citrea.xyz";
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const chainId = 5115;

const SWAP_ROUTER_ADDRESS = "0x3012E9049d05B4B5369D690114D5A5861EbB85cb";
const WC_BTC_ADDRESS = "0x8d0c9d1c17aE5e40ffF9bE350f57840E9E66Cd93";

const TOKENS = [
    { name: "USDC", address: "0x36c16eaC6B0Ba6c50f494914ff015fCa95B7835F" },
    { name: "S33", address: "0xb93b80d59c2fb3eb23817d4a27841ef8788826f0" },
    { name: "NUSD", address: "0x9b28b690550522608890c3c7e63c0b4a7ebab9aa" },
    { name: "SUMA", address: "0xde4251dd68e1ad5865b14dd527e54018767af58a" },
    { name: "VIVI", address: "0x2d62fb3442b5140f15578758c1b2881b6779dd21" },
    { name: "444", address: "0x488b72b74010e62a657154e6bb2389519671a311" }
];

function createSwapData(tokenOut, recipient) {
    return {
        tokenIn: WC_BTC_ADDRESS,
        tokenOut: tokenOut,
        deployer: ethers.constants.AddressZero,
        recipient: recipient,
        deadline: Math.floor(Date.now() / 1000) + 600,
        amountIn: ethers.BigNumber.from("1099511627774"),
        amountOutMinimum: ethers.BigNumber.from("0"),
        limitSqrtPrice: 0
    };
}

async function sendLegacyTransaction(wallet, router, swapParams, amountIn, nonce) {
    const swapData = router.interface.encodeFunctionData("exactInputSingle", [swapParams]);
    const multicallData = [swapData];
    
    const txData = {
        to: SWAP_ROUTER_ADDRESS,
        value: amountIn,
        data: router.interface.encodeFunctionData("multicall", [multicallData]),
        gasLimit: 329388,
        gasPrice: ethers.utils.parseUnits("0.015", "gwei"),
        nonce: nonce,
        chainId: chainId
    };
    
    const signedTx = await wallet.signTransaction(txData);
    const txResponse = await provider.sendTransaction(signedTx);
    return txResponse;
}

function getRandomToken() {
    return TOKENS[Math.floor(Math.random() * TOKENS.length)];
}

function getRandomAmount() {
    const min = 0.000001;
    const max = 0.000009;
    return (Math.random() * (max - min) + min).toFixed(6);
}

function showLoading(message) {
    const frames = ['🚶', '🏃', '🚶', '🏃'];
    let i = 0;
    
    const interval = setInterval(() => {
        process.stdout.write(`\r${frames[i]} ${message}`);
        i = (i + 1) % frames.length;
    }, 200);
    
    return {
        stop: () => {
            clearInterval(interval);
            process.stdout.write('\r');
        }
    };
}

async function swapCbtcToToken(privateKey, amountCbtc, tokenAddress, nonce) {
    const wallet = new ethers.Wallet(privateKey, provider);
    const routerABI = [
        "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
        "function exactInputSingle(tuple(address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) external payable returns (uint256 amountOut)"
    ];
    
    const router = new ethers.Contract(SWAP_ROUTER_ADDRESS, routerABI, wallet);
    const amountIn = ethers.utils.parseEther(amountCbtc.toString());
    const token = TOKENS.find(t => t.address === tokenAddress);
    
    if (!token) throw new Error("Token tidak valid");
    
    const swapParams = createSwapData(tokenAddress, wallet.address);
    const txResponse = await sendLegacyTransaction(wallet, router, swapParams, amountIn, nonce);
    
    return {
        txResponse,
        tokenName: token.name,
        amount: amountCbtc
    };
}

function savePrivateKeyToEnv(privateKey) {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    
    try {
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        if (envContent.includes('PRIVATE_KEY=')) {
            envContent = envContent.replace(
                /PRIVATE_KEY=.*/,
                `PRIVATE_KEY="${privateKey}"`
            );
        } else {
            envContent += `\nPRIVATE_KEY="${privateKey}"\n`;
        }
        
        fs.writeFileSync(envPath, envContent);
        console.log("✅ Private key disimpan di .env");
    } catch (error) {
        console.error("❌ Gagal menyimpan private key:", error);
    }
}

function loadPrivateKeyFromEnv() {
    return process.env.PRIVATE_KEY || null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    try {
        console.log("====================================");
        console.log("🚀 CITREA CBTC SWAP BOT - RANDOM MODE");
        console.log("====================================\n");
        
        let privateKey = loadPrivateKeyFromEnv();
        
        if (!privateKey) {
            privateKey = await new Promise((resolve) => {
                rl.question("🔑 Masukkan private key Anda: ", resolve);
            });
            savePrivateKeyToEnv(privateKey);
        } else {
            console.log("✅ Menggunakan private key dari .env");
        }
        
        const sessionCount = await new Promise((resolve) => {
            rl.question("🔄 Berapa sesi swap yang ingin dilakukan? ", resolve);
        });
        const count = parseInt(sessionCount) || 1;
        
        const delaySec = await new Promise((resolve) => {
            rl.question("⏱️ Masukkan jeda antar swap (detik): ", resolve);
        });
        const delay = parseInt(delaySec) * 1000 || 0;
        
        rl.close();
        
        const wallet = new ethers.Wallet(privateKey, provider);
        let currentNonce = await provider.getTransactionCount(wallet.address);
        
        const transactionResults = [];
        
        console.log("\n🔥 Memulai proses swap acak...");
        console.log("------------------------------------");
        
        for (let i = 0; i < count; i++) {
            const amount = getRandomAmount();
            const token = getRandomToken();
            const loading = showLoading(`Sesi ${i+1}/${count}: Swap ${amount} CBTC ➡️ ${token.name}...`);
            
            try {
                const result = await swapCbtcToToken(privateKey, amount, token.address, currentNonce);
                loading.stop();
                
                console.log(`\n✅ [Sesi ${i+1}] Berhasil!`);
                console.log(`   Jumlah: ${amount} CBTC`);
                console.log(`   Token: ${result.tokenName}`);
                console.log(`   TX: https://explorer.testnet.citrea.xyz/tx/${result.txResponse.hash}`);
                
                transactionResults.push({
                    session: i + 1,
                    hash: result.txResponse.hash,
                    token: result.tokenName,
                    amount: amount
                });
                
                currentNonce++;
                
                if (i < count - 1 && delay > 0) {
                    console.log(`\n⏳ Menunggu ${delay/1000} detik...`);
                    await sleep(delay);
                }
            } catch (error) {
                loading.stop();
                console.error(`\n❌ [Sesi ${i+1}] Gagal: ${error.message}`);
                currentNonce++; 
            }
            
            console.log("------------------------------------");
        }
        
        console.log("\n📊 RINGKASAN TRANSAKSI");
        console.log("=======================");
        console.log(`Total sesi: ${count}`);
        console.log(`Berhasil: ${transactionResults.length}`);
        console.log(`Gagal: ${count - transactionResults.length}`);
        
        if (transactionResults.length > 0) {
            console.log("\n🔍 Detail Transaksi Berhasil:");
            transactionResults.forEach(tx => {
                console.log(`- [Sesi ${tx.session}] ${tx.amount} CBTC ➡️ ${tx.token}`);
                console.log(`  TX: https://explorer.testnet.citrea.xyz/tx/${tx.hash}`);
            });
        }
        
        console.log("\n✅ Proses selesai!");
    } catch (error) {
        console.error("\n❌ TERJADI KESALAHAN:", error);
    }
}

main();
