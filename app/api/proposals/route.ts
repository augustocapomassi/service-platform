import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JobStatus } from '@prisma/client';
import { ethers } from 'ethers';
import { notifyUser } from '@/server/socket-wrapper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, providerId, message, proposedAmount } = body;

    // Validation
    if (!jobId || !providerId) {
      return NextResponse.json(
        { error: 'Missing required fields: jobId and providerId' },
        { status: 400 }
      );
    }

    // Verify job exists and is in correct status
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        client: {
          select: {
            id: true,
          },
        },
        provider: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Can't propose to your own job
    if (job.clientId === providerId) {
      return NextResponse.json(
        { error: 'No puedes postularte a tu propio trabajo' },
        { status: 400 }
      );
    }

    // Can't propose if job already has a provider
    if (job.providerId) {
      return NextResponse.json(
        { error: 'Este trabajo ya tiene un proveedor asignado' },
        { status: 400 }
      );
    }

    // Can't propose if job is not pending
    if (job.status !== JobStatus.PENDING) {
      return NextResponse.json(
        { error: 'Solo puedes postularte a trabajos pendientes' },
        { status: 400 }
      );
    }

    // Check if provider already proposed
    const existingProposal = await prisma.jobProposal.findUnique({
      where: {
        jobId_providerId: {
          jobId,
          providerId,
        },
      },
    });

    if (existingProposal) {
      // Check if proposal was rejected and if 24 hours have passed
      if (existingProposal.status === 'COUNTEROFFER_REJECTED' && existingProposal.rejectedAt) {
        const rejectedAt = new Date(existingProposal.rejectedAt);
        const now = new Date();
        const hoursSinceRejection = (now.getTime() - rejectedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceRejection < 24) {
          const remainingHours = Math.ceil(24 - hoursSinceRejection);
          return NextResponse.json(
            { 
              error: `Debes esperar 24 horas antes de postularte nuevamente. Tiempo restante: ${remainingHours} horas.`,
              cooldownRemaining: remainingHours,
            },
            { status: 400 }
          );
        }
      } else {
        // Proposal exists and is not in cooldown
        return NextResponse.json(
          { error: 'Ya te has postulado a este trabajo' },
          { status: 400 }
        );
      }
    }

    // Convert proposed amount to wei if provided
    let proposedAmountInWei: string | null = null;
    if (proposedAmount) {
      const amountNum = parseFloat(proposedAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return NextResponse.json(
          { error: 'El monto propuesto debe ser un número positivo' },
          { status: 400 }
        );
      }
      proposedAmountInWei = ethers.parseEther(proposedAmount.toString()).toString();
    }

    // Create proposal
    const proposal = await prisma.jobProposal.create({
      data: {
        jobId,
        providerId,
        message: message || null,
        proposedAmount: proposedAmountInWei,
        status: 'PENDING',
      },
      include: {
        provider: {
          select: {
            id: true,
            email: true,
            walletAddress: true,
            providerScore: true,
          },
        },
        job: {
          select: {
            id: true,
            title: true,
            clientId: true,
            client: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Send real-time notification to job client
    try {
      notifyUser(job.clientId, 'new-proposal', {
        jobId: job.id,
        jobTitle: proposal.job.title,
        proposalId: proposal.id,
        provider: {
          email: proposal.provider.email,
          providerScore: proposal.provider.providerScore,
        },
        message: proposal.message,
      });
    } catch (error) {
      console.error('Error sending notification:', error);
      // Don't fail the request if notification fails
    }

    return NextResponse.json(proposal, { status: 201 });
  } catch (error: any) {
    console.error('Error creating proposal:', error);
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Ya te has postulado a este trabajo' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

