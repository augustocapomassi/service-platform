// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {EscrowService} from "../contracts/EscrowService.sol";

contract DeployScript is Script {
    function run() external returns (EscrowService) {
        // Get the deployer address from the environment or use the default anvil account
        address deployer = msg.sender;
        if (deployer == address(0)) {
            // Default Anvil account 0
            deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        }
        
        vm.startBroadcast(deployer);
        
        EscrowService escrow = new EscrowService();
        
        vm.stopBroadcast();
        
        console.log("EscrowService deployed at:", address(escrow));
        console.log("Deployed by:", deployer);
        
        return escrow;
    }
}

