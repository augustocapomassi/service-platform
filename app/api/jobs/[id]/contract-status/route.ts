import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { getJobFromContract } from '@/lib/web3/escrow';
import { ethers } from 'ethers';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get token from cookie
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return NextResponse.json(
        { error: 'Token inválido' },
        { status: 401 }
      );
    }

    // Get the job
    const job = await prisma.job.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        contractJobId: true,
        client: {
          select: {
            id: true,
            walletAddress: true,
          },
        },
        provider: {
          select: {
            id: true,
            walletAddress: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Trabajo no encontrado' },
        { status: 404 }
      );
    }

    if (!job.contractJobId) {
      return NextResponse.json(
        { error: 'Este trabajo no tiene un contrato asociado' },
        { status: 400 }
      );
    }

    // Get contract job status
    const contractJob = await getJobFromContract(job.contractJobId);

    return NextResponse.json({
      contractJobId: job.contractJobId,
      status: {
        clientConfirmed: contractJob.clientConfirmed,
        providerConfirmed: contractJob.providerConfirmed,
        bothConfirmed: contractJob.clientConfirmed && contractJob.providerConfirmed,
        contractStatus: contractJob.status, // 0=PENDING, 1=IN_PROGRESS, 2=COMPLETED, 3=DISPUTED, 4=CANCELLED
      },
      amount: {
        wei: contractJob.amount.toString(),
        eth: ethers.formatEther(contractJob.amount),
      },
      participants: {
        client: contractJob.client,
        provider: contractJob.provider,
      },
      message: contractJob.clientConfirmed && contractJob.providerConfirmed
        ? 'Ambas partes han confirmado. Los fondos deberían haberse liberado al proveedor.'
        : contractJob.clientConfirmed
        ? 'El cliente ha confirmado. Esperando confirmación del proveedor...'
        : contractJob.providerConfirmed
        ? 'El proveedor ha confirmado. Esperando confirmación del cliente...'
        : 'Ninguna parte ha confirmado aún.',
    });
  } catch (error: any) {
    console.error('Error getting contract status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

