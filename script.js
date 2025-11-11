// ABI and Bytecode from OpenZeppelin ERC20 (compile first)
const contractABI = [
    {
        "inputs": [
            {"internalType": "string", "name": "name_", "type": "string"},
            {"internalType": "string", "name": "symbol_", "type": "string"},
            {"internalType": "uint256", "name": "totalSupply_", "type": "uint256"}
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    // Add full ABI from https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol
    // e.g., approve, transfer, balanceOf, etc. (get from Remix after compile)
];

// Bytecode from compiling ERC20 in Remix IDE (remix.ethereum.org)
const contractBytecode = "0x6080604052..."; // Get full from Remix after compile (shortened for space)

const TEAM_WALLET = "0x30f8441bC896054A9Ed570ed52c92b82BB1ECF4d"; // Team wallet
const SERVICE_FEE = "0.1"; // 0.1 BNB in ether

let web3;
let account;
let currentNetwork = "testnet"; // Default to testnet for testing

document.getElementById('networkSelect').addEventListener('change', (e) => {
    currentNetwork = e.target.value;
    switchToNetwork();
});

async function switchToNetwork() {
    const chainId = currentNetwork === "testnet" ? "0x61" : "0x38"; // Testnet: 97 (0x61), Mainnet: 56 (0x38)
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainId }],
        });
    } catch (error) {
        // If network not added, guide user
        if (error.code === 4902) {
            addNetworkPrompt(currentNetwork);
        } else {
            console.error(error);
        }
    }
}

function addNetworkPrompt(network) {
    if (network === "testnet") {
        alert("BSC Testnet not found? Add manually:\nNetwork Name: BNB Smart Chain Testnet\nRPC URL: https://data-seed-prebsc-1-s1.binance.org:8545\nChain ID: 97\nSymbol: BNB\nExplorer: https://testnet.bscscan.com\nThen switch back!");
    } else {
        alert("BSC Mainnet not found? Add manually:\nNetwork Name: BNB Smart Chain\nRPC URL: https://bsc-dataseed.binance.org/\nChain ID: 56\nSymbol: BNB\nExplorer: https://bscscan.com");
    }
}

document.getElementById('connectBtn').addEventListener('click', async () => {
    if (window.ethereum) {
        web3 = new Web3(window.ethereum);
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            const accounts = await web3.eth.getAccounts();
            account = accounts[0];
            document.getElementById('account').innerHTML = `Account: ${account.slice(0,10)}...`;
            document.getElementById('connect-wallet').style.display = 'none';
            document.getElementById('network-section').style.display = 'block';
            switchToNetwork(); // Switch to selected network
        } catch (error) { console.error(error); alert('Error: ' + error.message); }
    } else { alert('Install MetaMask first!'); }
});

document.getElementById('logo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 100000) { // 100KB limit
            alert('Logo file too large! Must be <100KB. Please resize and try again.');
            e.target.value = ''; // Clear file
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('logoPreview').src = ev.target.result;
            document.getElementById('logoPreview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('tokenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!account) return alert('Connect wallet first!');
    
    const name = document.getElementById('name').value;
    const symbol = document.getElementById('symbol').value;
    const supply = web3.utils.toWei(document.getElementById('supply').value, 'ether');
    const decimals = document.getElementById('decimals').value;
    const logoFile = document.getElementById('logo').files[0];
    
    if (!logoFile) return alert('Upload logo too!');
    
    // Read logo as base64
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const logoBase64 = ev.target.result.split(',')[1]; // Remove data:image prefix
        
        try {
            // 1. Deploy Token Contract
            const deployTx = new web3.eth.Contract(contractABI).deploy({
                data: contractBytecode,
                arguments: [name, symbol, supply]
            });
            
            const gas = await deployTx.estimateGas({ from: account });
            const deployPromise = deployTx.send({ from: account, gas });
            
            // 2. Send 0.1 BNB to Team Wallet
            const feeWei = web3.utils.toWei(SERVICE_FEE, 'ether');
            const feeTx = web3.eth.sendTransaction({
                from: account,
                to: TEAM_WALLET,
                value: feeWei,
                gas: 21000 // Standard transfer gas
            });
            
            // Wait for both
            const [deployResult] = await Promise.all([deployPromise, feeTx]);
            const tokenAddress = deployResult.options.address;
            const explorerUrl = currentNetwork === "testnet" ? `https://testnet.bscscan.com/address/${tokenAddress}` : `https://bscscan.com/address/${tokenAddress}`;
            
            // 3. Generate Metadata JSON
            const metadata = {
                name: name,
                symbol: symbol,
                logo: `data:image/png;base64,${logoBase64}`,
                description: `Created with Bakla Token Creator - Only 0.1 BNB fee!`
            };
            const metadataJson = JSON.stringify(metadata, null, 2);
            
            // 4. Display Result
            document.getElementById('result').innerHTML = `
                <h3>Success! Token Address: ${tokenAddress}</h3>
                <p><a href="${explorerUrl}" target="_blank">View on Explorer</a></p>
                <p>Download Metadata: <a href="data:text/json;charset=utf-8,${encodeURIComponent(metadataJson)}" download="token-metadata.json">Download JSON</a></p>
                <p>Use JSON to Update Token Info on Explorer for logo display!</p>
            `;
            
            alert('Deploy successful! Check wallet for fees.');
        } catch (error) { console.error(error); alert('Error: ' + error.message); }
    };
    reader.readAsDataURL(logoFile);
});