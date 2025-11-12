// Global vars
let provider, signer, contractData, account, userNetwork;

// Load contract on window load
window.addEventListener('load', async () => {
    console.log('Window loaded');
    try {
        const response = await fetch('contract.json');
        if (!response.ok) throw new Error('Cannot load contract.json');
        contractData = await response.json();
        console.log('Contract data loaded successfully');
    } catch (error) {
        console.error('Failed to load contract.json:', error);
        document.getElementById('error').innerText = 'Error: ไม่สามารถโหลด contract.json ได้: ' + error.message;
    }

    // Setup buttons
    document.getElementById('connectBtn').addEventListener('click', connectWallet);
    document.getElementById('deployBtn').addEventListener('click', deployContract);
    document.getElementById('verifyBtn').addEventListener('click', verifyOnBscScan);
});

// Connect MetaMask
async function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
        console.log('Connecting to MetaMask...');
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            account = accounts[0];
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            userNetwork = await provider.getNetwork();

            // Check BSC Testnet (chainId 97)
            if (userNetwork.chainId !== 97) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x61' }]
                    });
                    userNetwork = await provider.getNetwork();
                    console.log('Switched to chainId: 0x61');
                } catch (switchError) {
                    if (switchError.code === 4902) {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: '0x61',
                                chainName: 'BSC Testnet',
                                rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
                                nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                                blockExplorerUrls: ['https://testnet.bscscan.com']
                            }]
                        });
                        userNetwork = await provider.getNetwork();
                    } else {
                        throw switchError;
                    }
                }
            }

            document.getElementById('account').innerText = account;
            document.getElementById('network').innerText = `BSC Testnet (Chain ID: ${userNetwork.chainId})`;
            document.getElementById('walletInfo').style.display = 'block';
            document.getElementById('deployForm').style.display = 'block';
            document.getElementById('connectBtn').innerText = 'เชื่อมต่อแล้ว';
            console.log('MetaMask connected:', account);
        } catch (error) {
            console.error('Connect error:', error);
            document.getElementById('error').innerText = 'Error: ' + error.message;
        }
    } else {
        document.getElementById('error').innerText = 'กรุณาติดตั้ง MetaMask!';
    }
}

// Deploy Contract
async function deployContract() {
    if (!contractData || !signer) {
        document.getElementById('error').innerText = 'กรุณาเชื่อมต่อ wallet และโหลด contract ก่อน!';
        return;
    }

    const name = document.getElementById('name').value.trim();
    const symbol = document.getElementById('symbol').value.trim();
    const totalSupplyInput = document.getElementById('supply').value.trim();

    // Validate inputs
    if (!name || !symbol || !totalSupplyInput) {
        document.getElementById('error').innerText = 'กรุณากรอกข้อมูลให้ครบ!';
        return;
    }

    let totalSupply;
    try {
        totalSupply = ethers.utils.parseUnits(totalSupplyInput, 18); // Assume 18 decimals
        if (totalSupply.lte(0)) throw new Error('Total supply ต้องมากกว่า 0');
    } catch (e) {
        document.getElementById('error').innerText = 'Total supply ไม่ถูกต้อง: ' + e.message;
        return;
    }

    console.log('Deploy inputs:', { name, symbol, totalSupply: totalSupply.toString() });

    document.getElementById('deployBtn').innerText = 'กำลัง Deploy...';
    document.getElementById('error').innerText = '';

    try {
        const factory = new ethers.ContractFactory(contractData.abi, contractData.bytecode, signer);
        console.log('Contract data:', { abi: contractData.abi.length, bytecode: contractData.bytecode.slice(0, 20) + '...' });

        // Estimate gas
        const deployTx = factory.getDeployTransaction(name, symbol, totalSupply);
        const gasEstimate = await provider.estimateGas(deployTx).catch(e => {
            throw new Error('Gas estimation failed: ' + (e.reason || e.message || JSON.stringify(e)));
        });
        console.log('Gas estimate:', gasEstimate.toString());

        // Check balance
        const balance = await provider.getBalance(account);
        console.log('Wallet balance:', ethers.utils.formatEther(balance), 'BNB');
        if (balance.lt(gasEstimate.mul(ethers.utils.parseUnits('20', 'gwei')))) {
            throw new Error('BNB ไม่พอสำหรับ gas');
        }

        // Deploy
        const tx = await factory.deploy(name, symbol, totalSupply, {
            gasLimit: gasEstimate.mul(150).div(100) // +50% buffer
        });
        console.log('Deploy tx sent:', tx.hash);

        // Wait for confirm
        const receipt = await tx.wait();
        const contractAddress = receipt.contractAddress;
        console.log('Deploy success, address:', contractAddress);

        // Show result
        document.getElementById('contractAddr').href = `https://testnet.bscscan.com/address/${contractAddress}`;
        document.getElementById('contractAddr').innerText = contractAddress;
        document.getElementById('txHash').href = `https://testnet.bscscan.com/tx/${tx.hash}`;
        document.getElementById('txHash').innerText = tx.hash;
        document.getElementById('result').style.display = 'block';
        document.getElementById('deployForm').style.display = 'none';
    } catch (error) {
        console.error('Deployment failed:', error);
        let msg = 'Error Deploy: ';
        if (error.code === 'INSUFFICIENT_FUNDS') msg += 'เงิน BNB ไม่พอ (เช็ค gas)';
        else if (error.code === 4001) msg += 'ยกเลิก tx ใน MetaMask';
        else if (error.reason) msg += error.reason;
        else msg += JSON.stringify(error, null, 2);
        document.getElementById('error').innerText = msg;
        document.getElementById('deployBtn').innerText = 'Deploy เหรียญ';
    }
}

// Verify on BscScan
function verifyOnBscScan() {
    const addr = document.getElementById('contractAddr').innerText;
    window.open(`https://testnet.bscscan.com/address/${addr}#code`, '_blank');
}
