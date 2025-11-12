// Network configurations
const networks = {
    testnet: {
        chainId: '0x61',
        rpc: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
        name: 'Binance Smart Chain Testnet',
        explorer: 'https://testnet.bscscan.com'
    },
    mainnet: {
        chainId: '0x38',
        rpc: 'https://bsc-dataseed.binance.org/',
        name: 'Binance Smart Chain Mainnet',
        explorer: 'https://bscscan.com'
    }
};

// Initialize Web3
let web3;
let provider;
let selectedAccount;
let contractData;

// Load contract ABI and Bytecode
fetch('contract.json')
    .then(response => {
        if (!response.ok) throw new Error('Failed to fetch contract.json');
        return response.json();
    })
    .then(data => {
        contractData = data;
        console.log('Contract data loaded successfully');
    })
    .catch(error => {
        console.error('Failed to load contract.json:', error);
        document.getElementById('result').innerText = 'Error: Failed to load contract data. Please check console or refresh.';
    });

// Connect wallet
async function connectWallet() {
    try {
        if (!window.Web3Modal) {
            throw new Error('Web3Modal not loaded. Please check CDN or network.');
        }
        const Web3Modal = window.Web3Modal;
        const web3Modal = new Web3Modal({
            cacheProvider: false, // Disable cache to avoid cookie issues
            providerOptions: {
                walletconnect: {
                    package: window.WalletConnectProvider,
                    options: {
                        rpc: {
                            97: networks.testnet.rpc,
                            56: networks.mainnet.rpc
                        }
                    }
                }
            },
            theme: 'dark'
        });
        provider = await web3Modal.connect();
        web3 = new Web3(provider);
        const accounts = await web3.eth.getAccounts();
        selectedAccount = accounts[0];
        document.getElementById('account').innerText = `Connected: ${selectedAccount}`;
        document.getElementById('connectBtn').innerText = 'Wallet Connected';
        document.getElementById('connectBtn').disabled = true;
    } catch (error) {
        console.error('Wallet connection failed:', error);
        document.getElementById('result').innerText = `Connection failed: ${error.message}`;
        // Fallback to MetaMask
        if (window.ethereum) {
            try {
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                web3 = new Web3(window.ethereum);
                provider = window.ethereum;
                const accounts = await web3.eth.getAccounts();
                selectedAccount = accounts[0];
                document.getElementById('account').innerText = `Connected: ${selectedAccount}`;
                document.getElementById('connectBtn').innerText = 'Wallet Connected';
                document.getElementById('connectBtn').disabled = true;
            } catch (metaMaskError) {
                console.error('MetaMask fallback failed:', metaMaskError);
                document.getElementById('result').innerText = `MetaMask connection failed: Please install or enable MetaMask.`;
            }
        } else {
            document.getElementById('result').innerText = 'MetaMask not detected. Please install MetaMask or use WalletConnect.';
        }
    }
}

// Switch network
async function switchNetwork(chainId) {
    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId }]
        });
    } catch (switchError) {
        if (switchError.code === 4902) {
            const network = Object.values(networks).find(n => n.chainId === chainId);
            await provider.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: network.chainId,
                    chainName: network.name,
                    rpcUrls: [network.rpc]
                }]
            });
        } else {
            throw switchError;
        }
    }
}

// Initialize on page load
window.onload = () => {
    // Connect wallet button
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', connectWallet);
    } else {
        console.error('Connect button not found');
        document.getElementById('result').innerText = 'Error: Connect button not found';
    }

    // Network selection
    const networkSelect = document.getElementById('networkSelect');
    if (networkSelect) {
        networkSelect.addEventListener('change', async (event) => {
            const selectedNetwork = event.target.value;
            const chainId = networks[selectedNetwork].chainId;
            if (web3 && selectedAccount) {
                try {
                    await switchNetwork(chainId);
                } catch (error) {
                    document.getElementById('result').innerText = `Failed to switch network: ${error.message}`;
                }
            } else {
                document.getElementById('result').innerText = 'Please connect wallet first.';
            }
        });
    }

    // Handle wallet events
    if (provider || window.ethereum) {
        (provider || window.ethereum).on('accountsChanged', (accounts) => {
            if (accounts.length > 0) {
                selectedAccount = accounts[0];
                document.getElementById('account').innerText = `Connected: ${selectedAccount}`;
                document.getElementById('connectBtn').innerText = 'Wallet Connected';
                document.getElementById('connectBtn').disabled = true;
            } else {
                selectedAccount = null;
                document.getElementById('account').innerText = 'Wallet disconnected';
                document.getElementById('connectBtn').innerText = 'Connect Wallet';
                document.getElementById('connectBtn').disabled = false;
            }
        });

        (provider || window.ethereum).on('chainChanged', () => {
            window.location.reload();
        });
    }

    // Index page: Save form data and redirect
    const tokenForm = document.getElementById('tokenForm');
    if (tokenForm) {
        tokenForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const name = document.getElementById('name').value;
            const symbol = document.getElementById('symbol').value;
            const supply = document.getElementById('supply').value;
            const logo = document.getElementById('logo').files[0];
            const network = document.getElementById('networkSelect').value;

            if (!name || !symbol || !supply || !logo) {
                document.getElementById('result').innerText = 'Please fill all fields and upload a logo.';
                return;
            }

            if (logo.size > 100000) {
                document.getElementById('result').innerText = 'Logo must be less than 100KB.';
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                localStorage.setItem('tokenData', JSON.stringify({
                    name,
                    symbol,
                    supply,
                    logo: reader.result,
                    network
                }));
                window.location.href = 'deploy.html';
            };
            reader.readAsDataURL(logo);
        });
    }

    // Deploy page: Load data, calculate fees, and deploy
    if (window.location.pathname.includes('deploy.html')) {
        const tokenData = JSON.parse(localStorage.getItem('tokenData'));
        if (!tokenData) {
            window.location.href = 'index.html';
            return;
        }

        document.getElementById('tokenName').innerText = tokenData.name;
        document.getElementById('tokenSymbol').innerText = tokenData.symbol;
        document.getElementById('tokenSupply').innerText = tokenData.supply;
        document.getElementById('tokenNetwork').innerText = networks[tokenData.network].name;
        document.getElementById('tokenLogo').src = tokenData.logo;

        // Calculate fees
        async function calculateFees() {
            if (!web3 || !selectedAccount) {
                document.getElementById('gasFee').innerText = 'Please connect wallet';
                document.getElementById('totalFee').innerText = 'Please connect wallet';
                return;
            }
            if (!contractData) {
                document.getElementById('gasFee').innerText = 'Contract data not loaded';
                document.getElementById('totalFee').innerText = 'Contract data not loaded';
                return;
            }
            try {
                await switchNetwork(networks[tokenData.network].chainId);
                const contract = new web3.eth.Contract(contractData.abi);
                const deployTx = contract.deploy({
                    data: contractData.bytecode,
                    arguments: [tokenData.name, tokenData.symbol, web3.utils.toWei(tokenData.supply, 'ether')]
                });

                const gas = await deployTx.estimateGas({ from: selectedAccount });
                const gasPrice = await web3.eth.getGasPrice();
                const gasFee = web3.utils.fromWei((gas * gasPrice).toString(), 'ether');
                const serviceFee = 0.1;
                const totalFee = (parseFloat(gasFee) + serviceFee).toFixed(6);

                document.getElementById('gasFee').innerText = `${gasFee} BNB`;
                document.getElementById('totalFee').innerText = `${totalFee} BNB`;
            } catch (error) {
                console.error('Fee calculation failed:', error);
                document.getElementById('gasFee').innerText = 'Error calculating gas';
                document.getElementById('totalFee').innerText = 'Error';
            }
        }

        // Trigger fee calculation when wallet is connected
        if (web3 && selectedAccount) {
            calculateFees();
        }

        // Recalculate fees when wallet connects
        document.getElementById('connectBtn').addEventListener('click', () => {
            setTimeout(calculateFees, 2000); // Wait for wallet connection
        });

        document.getElementById('deployBtn').addEventListener('click', async () => {
            if (!web3 || !selectedAccount) {
                document.getElementById('result').innerText = 'Please connect wallet first.';
                return;
            }
            if (!contractData) {
                document.getElementById('result').innerText = 'Contract data not loaded. Please try again.';
                return;
            }

            try {
                await switchNetwork(networks[tokenData.network].chainId);
                const contract = new web3.eth.Contract(contractData.abi);
                const deployTx = contract.deploy({
                    data: contractData.bytecode,
                    arguments: [tokenData.name, tokenData.symbol, web3.utils.toWei(tokenData.supply, 'ether')]
                });

                const gas = await deployTx.estimateGas({ from: selectedAccount });
                const gasPrice = await web3.eth.getGasPrice();

                // Send service fee (0.1 BNB)
                await web3.eth.sendTransaction({
                    from: selectedAccount,
                    to: '0x30f8441bC896054A9Ed570ed52c92b82BB1ECF4d',
                    value: web3.utils.toWei('0.1', 'ether')
                });

                // Deploy token contract
                const deployedContract = await deployTx.send({
                    from: selectedAccount,
                    gas,
                    gasPrice
                });

                document.getElementById('result').innerHTML = `
                    <p>Token Deployed Successfully!</p>
                    <p>Contract Address: ${deployedContract.options.address}</p>
                    <p>Transaction Hash: <a href="${networks[tokenData.network].explorer}/tx/${deployedContract.transactionHash}" target="_blank">${deployedContract.transactionHash}</a></p>
                `;
            } catch (error) {
                console.error('Deployment failed:', error);
                document.getElementById('result').innerText = `Deployment failed: ${error.message}`;
            }
        });
    }

    // Logo preview
    const logoInput = document.getElementById('logo');
    if (logoInput) {
        logoInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.getElementById('logoPreview').src = e.target.result;
                    document.getElementById('logoPreview').style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }
};
