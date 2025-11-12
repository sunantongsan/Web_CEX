// Global vars
let provider, signer, contractData, account, userNetwork;

window.addEventListener('load', async () => {
    console.log('Deploy page loaded');
    try {
        const response = await fetch('contract.json');
        if (!response.ok) throw new Error('Cannot load contract.json');
        contractData = await response.json();
        console.log('Contract data loaded successfully');
    } catch (error) {
        console.error('Failed to load contract.json:', error);
        document.getElementById('error').innerText = 'Error: ไม่สามารถโหลด contract.json ได้: ' + error.message;
        return;
    }

    // Load token data
    const tokenData = JSON.parse(localStorage.getItem('tokenData') || '{}');
    if (!tokenData.name || !tokenData.symbol || !tokenData.totalSupply) {
        document.getElementById('error').innerText = 'ข้อมูลเหรียญไม่ครบ กรุณาเริ่มใหม่';
        return;
    }

    // Connect wallet
    if (typeof window.ethereum !== 'undefined') {
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
                                rpcUrls: [
                                    'https://data-seed-prebsc-1-s1.binance.org:8545/',
                                    'https://data-seed-prebsc-2-s2.binance.org:8545/'
                                ],
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
            document.getElementById('name').innerText = tokenData.name;
            document.getElementById('symbol').innerText = tokenData.symbol;
            document.getElementById('supply').innerText = ethers.utils.formatUnits(tokenData.totalSupply, 18);
            document.getElementById('deployBtn').addEventListener('click', () => deployContract(tokenData));
            document.getElementById('verifyBtn').addEventListener('click', verifyOnBscScan);
            console.log('MetaMask connected:', account);
        } catch (error) {
            console.error('Connect error:', error);
            document.getElementById('error').innerText = 'Error: ' + error.message;
        }
    } else {
        document.getElementById('error').innerText = 'กรุณาติดตั้ง MetaMask!';
    }
});

// Deploy contract and pay service fee
async function deployContract(tokenData) {
    if (!contractData || !signer) {
        document.getElementById('error').innerText = 'กรุณาเชื่อมต่อ wallet และโหลด contract!';
        return;
    }

    document.getElementById('deployBtn').innerText = 'กำลัง Deploy...';
    document.getElementById('error').innerText = '';

    try {
        const factory = new ethers.ContractFactory(contractData.abi, contractData.bytecode, signer);
        console.log('Contract data:', { abi: contractData.abi.length, bytecode: contractData.bytecode.slice(0, 20) + '...' });

        // Estimate gas for deploy
        const deployTx = factory.getDeployTransaction(tokenData.name, tokenData.symbol, tokenData.totalSupply);
        const gasEstimate = await provider.estimateGas(deployTx);
        console.log('Gas estimate:', gasEstimate.toString());

        // Check balance
        const gasPrice = ethers.utils.parseUnits('5', 'gwei');
        const networkFee = gasEstimate.mul(gasPrice);
        const serviceFee = ethers.utils.parseEther('0.1'); // 0.1 BNB
        const totalFee = networkFee.add(serviceFee);
        const balance = await provider.getBalance(account);
        console.log('Wallet balance:', ethers.utils.formatEther(balance), 'BNB');
        if (balance.lt(totalFee)) {
            throw new Error(`BNB ไม่เพียงพอ ต้องการอย่างน้อย ${ethers.utils.formatEther(totalFee)} BNB`);
        }

        // Deploy contract
        const tx = await factory.deploy(tokenData.name, tokenData.symbol, tokenData.totalSupply, {
            gasLimit: gasEstimate.mul(150).div(100) // +50% buffer
        });
        console.log('Deploy tx sent:', tx.hash);

        // Wait for confirmation
        const receipt = await tx.wait();
        const contractAddress = receipt.contractAddress;
        console.log('Deploy success, address:', contractAddress);

        // Pay service fee (0.1 BNB)
        const serviceWallet = '0x34d27165382fdc48b468e5deb617ea1018e3454e';
        const paymentTx = await signer.sendTransaction({
            to: serviceWallet,
            value: serviceFee
        });
        console.log('Service fee tx sent:', paymentTx.hash);
        await paymentTx.wait();
        console.log('Service fee paid');

        // Show result
        document.getElementById('contractAddr').href = `https://testnet.bscscan.com/address/${contractAddress}`;
        document.getElementById('contractAddr').innerText = contractAddress;
        document.getElementById('txHash').href = `https://testnet.bscscan.com/tx/${tx.hash}`;
        document.getElementById('txHash').innerText = tx.hash;
        document.getElementById('result').style.display = 'block';
        document.getElementById('deployBtn').style.display = 'none';
    } catch (error) {
        console.error('Deployment failed:', error);
        let msg = 'Error Deploy: ';
        if (error.code === 'INSUFFICIENT_FUNDS') msg += 'เงิน BNB ไม่พอ (เช็ค gas)';
        else if (error.code === 4001) msg += 'ยกเลิก tx ใน MetaMask';
        else if (error.reason) msg += error.reason;
        else if (error.message) msg += error.message;
        else msg += JSON.stringify(error, null, 2);
        document.getElementById('error').innerText = msg;
        document.getElementById('deployBtn').innerText = 'Deploy และชำระค่าบริการ';
    }
}

// Verify on BscScan
function verifyOnBscScan() {
    const addr = document.getElementById('contractAddr').innerText;
    window.open(`https://testnet.bscscan.com/address/${addr}#code`, '_blank');
}
