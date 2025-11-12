// Global vars
let provider, signer, contractData, account, userNetwork;

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
    document.getElementById('nextBtn').addEventListener('click', goToDeploy);

    // Logo preview
    document.getElementById('logo').addEventListener('change', previewLogo);
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
            document.getElementById('walletInfo').style.display = 'block';
            document.getElementById('createForm').style.display = 'block';
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

// Preview logo
function previewLogo(event) {
    const file = event.target.files[0];
    if (file) {
        if (file.size > 1 * 1024 * 1024) {
            document.getElementById('error').innerText = 'ไฟล์โลโก้ต้องเล็กกว่า 1MB';
            return;
        }
        if (!['image/png', 'image/jpeg'].includes(file.type)) {
            document.getElementById('error').innerText = 'ต้องเป็นไฟล์ PNG หรือ JPG';
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById('preview');
            img.src = e.target.result;
            img.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

// Go to deploy page
async function goToDeploy() {
    if (!contractData || !signer) {
        document.getElementById('error').innerText = 'กรุณาเชื่อมต่อ wallet และโหลด contract ก่อน!';
        return;
    }

    const name = document.getElementById('name').value.trim();
    const symbol = document.getElementById('symbol').value.trim();
    const totalSupplyInput = document.getElementById('supply').value.trim();
    const logoFile = document.getElementById('logo').files[0];

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

    if (!logoFile) {
        document.getElementById('error').innerText = 'กรุณาอัพโหลดโลโก้!';
        return;
    }

    console.log('Inputs:', { name, symbol, totalSupply: totalSupply.toString(), logo: logoFile.name });

    // Estimate gas
    try {
        const factory = new ethers.ContractFactory(contractData.abi, contractData.bytecode, signer);
        const deployTx = factory.getDeployTransaction(name, symbol, totalSupply);
        const gasEstimate = await provider.estimateGas(deployTx);
        console.log('Gas estimate:', gasEstimate.toString());

        // Assume gas price 5 gwei
        const gasPrice = ethers.utils.parseUnits('5', 'gwei');
        const networkFee = gasEstimate.mul(gasPrice);
        const serviceFee = ethers.utils.parseEther('0.1'); // 0.1 BNB
        const totalFee = networkFee.add(serviceFee);

        document.getElementById('gasEstimate').innerText = `ค่าใช้จ่ายทั้งหมด: ${ethers.utils.formatEther(totalFee)} BNB`;

        // Check balance
        const balance = await provider.getBalance(account);
        console.log('Wallet balance:', ethers.utils.formatEther(balance), 'BNB');
        if (balance.lt(totalFee)) {
            document.getElementById('error').innerText = `BNB ไม่เพียงพอ ต้องการอย่างน้อย ${ethers.utils.formatEther(totalFee)} BNB`;
            return;
        }

        // Store data in localStorage
        localStorage.setItem('tokenData', JSON.stringify({
            name,
            symbol,
            totalSupply: totalSupply.toString(),
            logo: logoFile ? await fileToBase64(logoFile) : null
        }));

        // Go to deploy page
        window.location.href = 'deploy.html';
    } catch (error) {
        console.error('Gas estimation failed:', error);
        document.getElementById('error').innerText = 'Error: ไม่สามารถคำนวณค่า gas ได้: ' + (error.reason || error.message || JSON.stringify(error));
    }
}

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
