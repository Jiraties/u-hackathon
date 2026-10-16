import type { Hex, Address } from 'viem';
export const linkBytecode=(artifact:{bytecode:Hex;linkReferences?:Record<string,Record<string,{start:number;length:number}[]>>},libraries:Record<string,Address>):Hex=>{
  let code=artifact.bytecode.slice(2);
  for(const file of Object.values(artifact.linkReferences??{}))for(const [name,refs]of Object.entries(file)){
    const address=libraries[name];if(!address)throw Error(`Missing generated verifier library ${name}`);
    for(const ref of refs){if(ref.length!==20)throw Error('Unexpected library reference length');code=code.slice(0,ref.start*2)+address.slice(2).toLowerCase()+code.slice((ref.start+ref.length)*2);}
  }
  if(!/^[a-fA-F0-9]+$/.test(code))throw Error('Unresolved verifier library references');return `0x${code}`;
};
