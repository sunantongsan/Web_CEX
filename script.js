let web3;
let contractData = {};

// โหลด contract1.json และ contract2.json
async function loadContractData() {
    try {
        const abiResponse = await fetch('contract1.json');
        const bytecodeResponse = await fetch('contract2.json');
        contractData.abi = await abiResponse.json();
        contractData.bytecode = (await bytecodeResponse.json()).bytecode;
        console.log("Contract data loaded successfully");
    } catch (error) {
        console.error("Failed to load contract data:", error);
    }
}

// สลับ network
async function switchNetwork(chainId) {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId }],
        });
        console.log(`Switched to chainId: ${chainId}`);
    } catch (error) {
        console.error("Network switch failed:", error);
    }
}

// คำนวณค่า Gas Fee
async function calculateFees(params) {
    console.log("Calculating fees with params:", params);
    try {
        const contract = new web3.eth.Contract(contractData.abi);
        const deployData = contract.deploy({
            data: contractData.bytecode,
            arguments: [params.name, params.symbol, new web3.utils.BN(params.supply)]
        }).encodeABI();

        const gasPrice = new web3.utils.BN(await web3.eth.getGasPrice());
        const gasEstimate = new web3.utils.BN(await web3.eth.estimateGas({
            data: deployData
        }));
        const totalFee = gasPrice.mul(gasEstimate);

        console.log(`Gas Price: ${gasPrice.toString()}`);
        console.log(`Gas Estimate: ${gasEstimate.toString()}`);
        console.log(`Total Fee: ${totalFee.toString()} wei`);

        document.getElementById('fee').innerText = `${web3.utils.fromWei(totalFee, 'ether')} BNB`;
    } catch (error) {
        console.error("Fee calculation failed:", error);
        document.getElementById('fee').innerText = "Failed to calculate fee";
    }
}

// Deploy contract
async function deployContract(params) {
    console.log("Deploying contract with params:", params);
    try {
        const accounts = await web3.eth.getAccounts();
        const contract = new web3.eth.Contract(contractData.abi);

        const deployTx = contract.deploy({
            data: contractData.bytecode,
            arguments: [params.name, params.symbol, new web3.utils.BN(params.supply)]
        });

        const gasPrice = new web3.utils.BN(await web3.eth.getGasPrice());
        const gasEstimate = new web3.utils.BN(await deployTx.estimateGas());

        const deployedContract = await deployTx.send({
            from: accounts[0],
            gas: gasEstimate.toString(),
            gasPrice: gasPrice.toString()
        });

        console.log("Contract deployed at:", deployedContract.options.address);
        document.getElementById('result').innerText = `Contract deployed at: ${deployContract.options.address}`;
    } catch (error) {
        console.error("Deployment failed:", error);
        document.getElementById('result').innerText = "Deployment failed";
    }
}

// ฟังก์ชันสำหรับ index.html
async function saveTokenData() {
    const tokenData = {
        name: document.getElementById('tokenName').value,
        symbol: document.getElementById('tokenSymbol').value,
        supply: document.getElementById('tokenSupply').value,
        logo: document.getElementById('tokenLogo').files[0] ? await readFileAsDataURL(document.getElementById('tokenLogo').files[0]) : '',
        network: document.getElementById('network').value
    };
    localStorage.setItem('tokenData', JSON.stringify(tokenData));
    window.location.href = 'deploy.html';
}

// อ่านไฟล์เป็น Data URL
function readFileAsDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

// เริ่มต้นหน้าเว็บ
window.onload = async () => {
    console.log("Window loaded");
    if (window.ethereum) {
        web3 = new Web3(window.ethereum);
        console.log("Initialized Web3");
        
        // ถ้าเป็น deploy.html
        if (window.location.pathname.includes('deploy.html')) {
            await loadContractData();
            const tokenData = JSON.parse(localStorage.getItem('tokenData'));
            console.log("Token data loaded in deploy.html:", tokenData);
            
            // สลับไป BSC Testnet
            await switchNetwork('0x61');
            
            // คำนวณ fee
            await calculateFees(tokenData);
            
            // เมื่อกดปุ่ม Deploy
            const deployButton = document.getElementById('deployButton');
            if (deployButton) {
                deployButton.onclick = async () => {
                    await deployContract(tokenData);
                };
            }
        }
        
        // ถ้าเป็น index.html
        const createButton = document.getElementById('createToken');
        if (createButton) {
            createButton.onclick = saveTokenData;
        }
    } else {
        console.error("No Ethereum provider detected");
        document.getElementById('result') && (document.getElementById('result').innerText = "Please install MetaMask");
    }
};
