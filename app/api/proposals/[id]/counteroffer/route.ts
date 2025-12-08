import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JobStatus } from '@prisma/client';
import { ethers } from 'ethers';
import { notifyUser, broadcast } from '@/server/socket-wrapper';
import { createJobInContract, acceptJobInContract } from '@/lib/web3/escrow';

// Provider accepts or rejects counteroffer
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { action } = body; // action: 'accept' or 'reject'

    if (!action || !['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "accept" or "reject"' },
        { status: 400 }
      );
    }

    // Get the proposal
    const proposal = await prisma.jobProposal.findUnique({
      where: { id: params.id },
      include: {
        job: {
          include: {
            client: {
              select: {
                id: true,
                email: true,
                walletAddress: true,
              },
            },
            provider: {
              select: {
                id: true,
              },
            },
          },
        },
        provider: {
          select: {
            id: true,
            email: true,
            walletAddress: true,
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json(
        { error: 'Proposal not found' },
        { status: 404 }
      );
    }

    // Verify proposal is in COUNTEROFFERED status
    if (proposal.status !== 'COUNTEROFFERED') {
      return NextResponse.json(
        { error: 'Proposal is not in counteroffer status' },
        { status: 400 }
      );
    }

    // Handle reject
    if (action === 'reject') {
      // Update proposal to rejected counteroffer status and set rejection timestamp
      const updatedProposal = await prisma.jobProposal.update({
        where: { id: params.id },
        data: {
          status: 'COUNTEROFFER_REJECTED',
          rejectedAt: new Date(),
        },
        include: {
          provider: {
            select: {
              id: true,
              email: true,
            },
          },
          job: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      // Notify client that counteroffer was rejected
      try {
        notifyUser(proposal.job.clientId, 'counteroffer-rejected', {
          proposalId: proposal.id,
          jobId: proposal.job.id,
          jobTitle: proposal.job.title,
          provider: {
            email: proposal.provider.email,
          },
        });
      } catch (error) {
        console.error('Error sending rejection notification:', error);
      }

      return NextResponse.json(updatedProposal);
    }

    // Handle accept
    if (action === 'accept') {
      // Verify job is still pending
      if (proposal.job.status !== JobStatus.PENDING) {
        return NextResponse.json(
          { error: 'Job is not in pending status' },
          { status: 400 }
        );
      }

      // Verify job doesn't already have a provider
      if (proposal.job.providerId) {
        return NextResponse.json(
          { error: 'Job already has a provider assigned' },
          { status: 400 }
        );
      }

      // Determine final amount (use counteroffer amount from client)
      const finalAmount = proposal.counterOfferAmount || proposal.proposedAmount || proposal.job.amount;

      // Create job in escrow contract and deposit funds
      let contractJobId: string | null = null;
      let txHash: string | null = null;
      
      try {
        console.log('💰 Creating job in escrow contract (counteroffer)...');
        const contractResult = await createJobInContract(
          proposal.job.clientId,
          proposal.provider.walletAddress,
          proposal.providerId,
          finalAmount,
          proposal.job.category
        );
        contractJobId = contractResult.contractJobId;
        txHash = contractResult.txHash;
        console.log(`✅ Job created in contract: ID=${contractJobId}, TX=${txHash}`);
        
        // Provider accepts the job in the contract (changes status to IN_PROGRESS)
        try {
          console.log('📝 Provider accepting job in contract...');
          const acceptResult = await acceptJobInContract(proposal.providerId, contractJobId);
          console.log(`✅ Job accepted in contract: TX=${acceptResult.txHash}`);
        } catch (error: any) {
          console.error('❌ Error accepting job in contract:', error);
          // Continue anyway - the job was created, we can try to accept later
          console.warn('⚠️ Job created but not accepted in contract. Status will remain PENDING.');
        }
      } catch (error: any) {
        console.error('❌ Error creating job in contract:', error);
        return NextResponse.json(
          { 
            error: 'Error al crear el trabajo en el contrato de escrow',
            details: error.message || 'Unknown error'
          },
          { status: 500 }
        );
      }

      // Update proposal status
      await prisma.jobProposal.update({
        where: { id: params.id },
        data: {
          status: 'ACCEPTED',
        },
      });

      // Update job: assign provider, set status to IN_PROGRESS, and save contract info
      const updatedJob = await prisma.job.update({
        where: { id: proposal.jobId },
        data: {
          providerId: proposal.providerId,
          status: JobStatus.IN_PROGRESS,
          amount: finalAmount, // Use counteroffer amount
          contractJobId: contractJobId,
          txHash: txHash,
        },
        include: {
          client: {
            select: {
              id: true,
              email: true,
            },
          },
          provider: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      // Reject all other proposals for this job
      await prisma.jobProposal.updateMany({
        where: {
          jobId: proposal.jobId,
          id: {
            not: params.id,
          },
        },
        data: {
          status: 'REJECTED',
        },
      });

      // Notify client that counteroffer was accepted
      try {
        notifyUser(proposal.job.clientId, 'counteroffer-accepted', {
          proposalId: proposal.id,
          jobId: proposal.job.id,
          jobTitle: proposal.job.title,
          provider: {
            email: proposal.provider.email,
          },
        });
      } catch (error) {
        console.error('Error sending acceptance notification:', error);
      }

      // Broadcast job status change to ALL connected users (not just participants)
      try {
        broadcast('job-status-changed', {
          jobId: updatedJob.id,
          jobTitle: updatedJob.title,
          oldStatus: 'PENDING',
          newStatus: 'IN_PROGRESS',
          message: `El trabajo "${updatedJob.title}" ha comenzado`,
        });
        console.log('📢 Broadcasted job status change to all users');
      } catch (error) {
        console.error('Error sending job status change notification:', error);
      }

      return NextResponse.json({
        job: updatedJob,
        proposal: {
          id: proposal.id,
          status: 'ACCEPTED',
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error handling counteroffer action:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
