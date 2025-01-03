import { AccountUpdate, Field, Mina, PrivateKey, PublicKey, UInt32, UInt64 } from 'o1js';
import { XToken, XTokenPublish } from './task5.js';
const balance = (acc: Mina.TestPublicKey | PublicKey, tokenId?: Field) =>
  Mina.getBalance(acc, tokenId).toJSON();

describe('XToken', () => {
  it('success', async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled: true });
    Mina.setActiveInstance(Local);

    const [deployer, buyer] = Local.testAccounts;

    let { publicKey: tokenAddress, privateKey: tokenOwner } = PrivateKey.randomKeypair();
    let token = new XToken(tokenAddress);
    let tokenId = token.deriveTokenId();

    await XToken.compile();

    const deployTokenTx = await Mina.transaction(deployer, async () => {
      AccountUpdate.fundNewAccount(deployer, 2);
      await token.deploy();
    });
    await deployTokenTx.prove();
    await deployTokenTx.sign([tokenOwner, deployer.key]).send();
    expect(balance(tokenOwner.toPublicKey(), tokenId)).toEqual('10000000000');

    const { publicKey: appAddress, privateKey: appAccount } = PrivateKey.randomKeypair();
    const zkApp = new XTokenPublish(appAddress, tokenId);
    await XTokenPublish.compile();

    const deployAppTx = await Mina.transaction(deployer, async () => {
      AccountUpdate.fundNewAccount(deployer);
      await zkApp.deploy({ endTime: UInt32.from(200) });
      await token.approveAccountUpdate(zkApp.self);
    });
    await deployAppTx.prove();
    await deployAppTx.sign([appAccount, deployer.key]).send();

    const transferTx = await Mina.transaction(deployer, async () => {
      await token.transfer(tokenAddress, appAddress, UInt64.from(100));
    });
    await transferTx.prove();
    await transferTx.sign([tokenOwner, deployer.key]).send();
    expect(balance(appAddress, tokenId)).toEqual('100');

    const receiptAddress = Mina.TestPublicKey(PrivateKey.random());
    const buyTx = await Mina.transaction(buyer, async () => {
      AccountUpdate.fundNewAccount(buyer, 2);
      AccountUpdate.createSigned(buyer).send({ to: appAddress, amount: UInt64.from(10) });
      await zkApp.buy(receiptAddress, UInt64.from(10));
      await token.approveAccountUpdate(zkApp.self);
    });
    await buyTx.prove();
    await buyTx.sign([buyer.key, receiptAddress.key]).send();
    expect(balance(appAddress, tokenId)).toEqual('90');
    expect(balance(receiptAddress, tokenId)).toEqual('10');
  });
});
