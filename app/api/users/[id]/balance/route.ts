import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProvider } from '@/lib/web3/utils';
import { ethers } from 'ethers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        walletAddress: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Get balance from blockchain
    const provider = getProvider();
    const balance = await provider.getBalance(user.walletAddress);
    const balanceInEth = ethers.formatEther(balance);

    return NextResponse.json({
      balance: balanceInEth,
      balanceWei: balance.toString(),
      walletAddress: user.walletAddress,
    });
  } catch (error: any) {
    console.error('Error fetching balance:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

