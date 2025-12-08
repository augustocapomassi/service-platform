import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JobStatus } from '@prisma/client';
import { ethers } from 'ethers';
import { notifyUser, broadcast } from '@/server/socket-wrapper';
import { createJobInContract, acceptJobInContract } from '@/lib/web3/escrow';

// Accept a proposal
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { action, counterOffer } = body; // action: 'accept' or 'counteroffer'

    if (!action || !['accept', 'counteroffer'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "accept" or "counteroffer"' },
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

    // Handle counteroffer
    if (action === 'counteroffer') {
      if (!counterOffer) {
        return NextResponse.json(
          { error: 'Counter offer amount is required' },
          { status: 400 }
        );
      }

      const amountNum = parseFloat(counterOffer);
      if (isNaN(amountNum) || amountNum <= 0) {
        return NextResponse.json(
          { error: 'Counter offer must be a positive number' },
          { status: 400 }
        );
      }

      const counterOfferInWei = ethers.parseEther(counterOffer.toString()).toString();

      // Update proposal with counteroffer - store in counterOfferAmount field
      const updatedProposal = await prisma.jobProposal.update({
        where: { id: params.id },
        data: {
          counterOfferAmount: counterOfferInWei,
          status: 'COUNTEROFFERED',
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

      // Notify provider about counteroffer
      try {
        notifyUser(proposal.providerId, 'proposal-counteroffered', {
          proposalId: proposal.id,
          jobId: proposal.job.id,
          jobTitle: proposal.job.title,
          counterOffer: counterOfferInWei,
          originalAmount: proposal.proposedAmount || proposal.job.amount,
        });
      } catch (error) {
        console.error('Error sending counteroffer notification:', error);
      }

      return NextResponse.json(updatedProposal);
    }

    // Handle accept (direct acceptance, not counteroffer)
    if (action === 'accept') {
      // Verify proposal is not in counteroffer status (should use counteroffer endpoint)
      if (proposal.status === 'COUNTEROFFERED') {
        return NextResponse.json(
          { error: 'Cannot directly accept a proposal with counteroffer. Provider must accept counteroffer first.' },
          { status: 400 }
        );
      }

      // Determine final amount (use proposal's amount, otherwise use job amount)
      const finalAmount = proposal.proposedAmount || proposal.job.amount;

      // Create job in escrow contract and deposit funds
      let contractJobId: string | null = null;
      let txHash: string | null = null;
      let acceptTxHash: string | null = null;
      
      try {
        console.log('💰 Step 1: Creating job in escrow contract and depositing funds...');
        const contractResult = await createJobInContract(
          proposal.job.clientId,
          proposal.provider.walletAddress,
          proposal.providerId,
          finalAmount,
          proposal.job.category
        );
        contractJobId = contractResult.contractJobId;
        txHash = contractResult.txHash;
        console.log(`✅ Step 1 complete: Job created in contract: ID=${contractJobId}, TX=${txHash}`);
        console.log(`✅ Funds deposited to escrow contract`);
        
        // CRITICAL: Provider MUST accept the job in the contract BEFORE we update DB to IN_PROGRESS
        // This ensures funds are in escrow and job is in IN_PROGRESS in the contract
        console.log('💰 Step 2: Provider accepting job in contract (changes status to IN_PROGRESS)...');
        const acceptResult = await acceptJobInContract(proposal.providerId, contractJobId);
        acceptTxHash = acceptResult.txHash;
        console.log(`✅ Step 2 complete: Job accepted in contract: TX=${acceptTxHash}`);
        console.log(`✅ Job status changed to IN_PROGRESS in contract`);
      } catch (error: any) {
        console.error('❌ Error in contract operations:', error);
        console.error('❌ Error details:', {
          message: error.message,
          code: error.code,
          data: error.data,
        });
        
        // If contract operations fail, DO NOT update database
        // The job must remain in PENDING status until funds are in escrow and job is accepted
        return NextResponse.json(
          { 
            error: 'Error al procesar el trabajo en el contrato de escrow',
            details: error.message || 'Unknown error',
            message: 'El trabajo no puede pasar a estado "en progreso" hasta que los fondos estén en escrow y el proveedor acepte el trabajo en el contrato.'
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
      // Only update to IN_PROGRESS if BOTH contract operations succeeded
      const updatedJob = await prisma.job.update({
        where: { id: proposal.jobId },
        data: {
          providerId: proposal.providerId,
          status: JobStatus.IN_PROGRESS,
          amount: finalAmount, // Update amount if there was a counteroffer
          contractJobId: contractJobId,
          txHash: txHash, // This is the createJob transaction hash
          // Note: acceptTxHash is not stored in DB, but the job is now IN_PROGRESS in contract
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

      // Notify provider that their proposal was accepted
      try {
        notifyUser(proposal.providerId, 'proposal-accepted', {
          proposalId: proposal.id,
          jobId: proposal.job.id,
          jobTitle: proposal.job.title,
          amount: finalAmount,
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
    console.error('Error handling proposal action:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

