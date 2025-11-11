// ABI และ Bytecode จาก OpenZeppelin ERC20 (ต้อง compile ก่อน)
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
    // เพิ่ม ABI เต็มจาก https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol
    // เช่น: approve, transfer, balanceOf, etc. (ดูใน Remix หลัง compile)
];

// Bytecode จาก compile ERC20 ใน Remix IDE (remix.ethereum.org)
const contractBytecode = "0x6080604052..."; // ดึงเต็มจาก Remix หลัง compile (ผมย่อเพื่อประหยัดพื้นที่)

const TEAM_WALLET = "0x30f8441bC896054A9Ed570ed52c92b82BB1ECF4d"; // กระเป๋าทีมคุณ
const SERVICE_FEE = web3.utils.toWei("0.1", "ether"); // 0.1 BNB

let web3;
let account;

document.getElementById('connectBtn').addEventListener('click', async () => {
    if (window.ethereum) {
        web3 = new Web3(window.ethereum);
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            const accounts = await web3.eth.getAccounts();
            account = accounts[0];
            document.getElementById('account').innerHTML = `Account: ${account.slice(0,10)}...`;
            document.getElementById('connect-wallet').style.display = 'none';
            
            // Switch to BSC Mainnet
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x38' }], // BSC Mainnet (Testnet: '0x61')
            });
        } catch (error) { console.error(error); alert('Error: ' + error.message); }
    } else { alert('ติดตั้ง MetaMask ก่อน!'); }
});

document.getElementById('logo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.size <= 100000) { // <100KB
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('logoPreview').src = ev.target.result;
            document.getElementById('logoPreview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else { alert('โลโก้ต้อง <100KB!'); }
});

document.getElementById('tokenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!account) return alert('เชื่อม wallet ก่อน!');
    
    const name = document.getElementById('name').value;
    const symbol = document.getElementById('symbol').value;
    const supply = web3.utils.toWei(document.getElementById('supply').value, 'ether');
    const decimals = document.getElementById('decimals').value;
    const logoFile = document.getElementById('logo').files[0];
    
    if (!logoFile) return alert('อัพโหลดโลโก้ด้วย!');
    
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
            const feeTx = web3.eth.sendTransaction({
                from: account,
                to: TEAM_WALLET,
                value: SERVICE_FEE,
                gas: 21000 // Standard transfer gas
            });
            
            // Wait for both transactions
            const [deployResult] = await Promise.all([deployPromise, feeTx]);
            const tokenAddress = deployResult.options.address;
            
            // 3. Generate Metadata JSON for BscScan
            const metadata = {
                name: name,
                symbol: symbol,
                logo: `data:image/png;base64,${logoBase64}`,
                description: `Created with Bakla Token Creator - Only 0.1 BNB fee!`
            };
            const metadataJson = JSON.stringify(metadata, null, 2);
            
            // 4. Display Result
            document.getElementById('result').innerHTML = `
                <h3>สำเร็จ! Token Address: ${tokenAddress}</h3>
                <p><a href="https://bscscan.com/address/${tokenAddress}" target="_blank">ดูบน BscScan</a></p>
                <p>ดาวน์โหลด Metadata: <a href="data:text/json;charset=utf-8,${encodeURIComponent(metadataJson)}" download="token-metadata.json">Download JSON</a></p>
                <p>นำ JSON ไป Update Token Info ที่ BscScan เพื่อแสดงโลโก้!</p>
            `;
            
            alert('Deploy สำเร็จ! ตรวจสอบ wallet สำหรับ gas fee และ 0.1 BNB');
        } catch (error) { console.error(error); alert('Error: ' + error.message); }
    };
    reader.readAsDataURL(logoFile);
});