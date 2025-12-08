import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JobStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { notifyUser, broadcast } from '@/server/socket-wrapper';
import { confirmCompletionInContract } from '@/lib/web3/escrow';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function POST(
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

    const userId = decoded.userId;

    // Get the job
    const job = await prisma.job.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        status: true,
        contractJobId: true,
        clientApproved: true,
        providerApproved: true,
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
        { error: 'Trabajo no encontrado' },
        { status: 404 }
      );
    }

    // Verify job is in progress
    if (job.status !== JobStatus.IN_PROGRESS) {
      return NextResponse.json(
        { error: 'El trabajo debe estar en progreso para ser completado' },
        { status: 400 }
      );
    }

    // Verify user is either client or provider
    if (job.client.id !== userId && job.provider?.id !== userId) {
      return NextResponse.json(
        { error: 'No tienes permiso para completar este trabajo' },
        { status: 403 }
      );
    }

    // Determine if user is client or provider
    const isClient = job.client.id === userId;
    const isProvider = job.provider?.id === userId;

    // Check if user has already approved
    if ((isClient && job.clientApproved) || (isProvider && job.providerApproved)) {
      return NextResponse.json(
        { error: 'Ya has aprobado este trabajo' },
        { status: 400 }
      );
    }

    // Update approval status
    const updateData: any = {};
    if (isClient) {
      updateData.clientApproved = true;
    }
    if (isProvider) {
      updateData.providerApproved = true;
    }

    // Check if both parties have approved
    const bothApproved = (isClient ? true : job.clientApproved) && 
                         (isProvider ? true : job.providerApproved);

    // If job has contractJobId, confirm completion in contract
    if (job.contractJobId) {
      try {
        console.log(`✅ Confirming completion in contract for job ${job.contractJobId} by user ${userId}`);
        
        // Import function to check contract state
        const { getJobFromContract } = await import('@/lib/web3/escrow');
        
        // Check current state of the contract job
        const contractJob = await getJobFromContract(job.contractJobId);
        const alreadyConfirmed = isClient 
          ? contractJob.clientConfirmed 
          : contractJob.providerConfirmed;
        
        if (alreadyConfirmed) {
          console.log(`⚠️ User ${userId} already confirmed in contract, skipping...`);
        } else {
          // Confirm completion for this user
          const contractResult = await confirmCompletionInContract(userId, job.contractJobId);
          console.log(`✅ Completion confirmed in contract: TX=${contractResult.txHash}`);
          
          // After confirming, check if both parties have now confirmed
          const updatedContractJob = await getJobFromContract(job.contractJobId);
          if (updatedContractJob.clientConfirmed && updatedContractJob.providerConfirmed) {
            console.log(`🎉 Both parties confirmed! Funds should be released to provider.`);
            console.log(`💰 Provider address: ${updatedContractJob.provider}`);
            console.log(`💰 Amount: ${updatedContractJob.amount.toString()} wei`);
          } else {
            const whoConfirmed = isClient ? 'client' : 'provider';
            const whoNeedsToConfirm = isClient ? 'provider' : 'client';
            console.log(`⏳ ${whoConfirmed} confirmed, waiting for ${whoNeedsToConfirm} to confirm...`);
          }
        }
      } catch (error: any) {
        console.error('❌ Error confirming completion in contract:', error);
        // Continue with DB update even if contract call fails
        // In production, you might want to handle this differently
      }
    }

    // Update job: set approvals and only change status to COMPLETED if both approved
    const updatedJob = await prisma.job.update({
      where: { id: params.id },
      data: {
        ...updateData,
        // Only change status to COMPLETED if both parties approved
        status: bothApproved ? JobStatus.COMPLETED : JobStatus.IN_PROGRESS,
      },
      select: {
        id: true,
        title: true,
        status: true,
        contractJobId: true,
        clientApproved: true,
        providerApproved: true,
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

    // Broadcast job status changes to ALL connected users (not just participants)
    try {
      const jobTitle = updatedJob.title;
      if (bothApproved) {
        // Both approved - job is now COMPLETED - broadcast to everyone
        broadcast('job-status-changed', {
          jobId: updatedJob.id,
          jobTitle: jobTitle,
          oldStatus: 'IN_PROGRESS',
          newStatus: 'COMPLETED',
          message: `El trabajo "${jobTitle}" ha sido completado por ambas partes`,
        });
        console.log('📢 Broadcasted job completion to all users');
      } else {
        // Only one approved - broadcast status change to everyone
        const whoApproved = isClient ? 'cliente' : 'proveedor';
        broadcast('job-status-changed', {
          jobId: updatedJob.id,
          jobTitle: jobTitle,
          oldStatus: 'IN_PROGRESS',
          newStatus: 'IN_PROGRESS', // Still in progress
          message: `El ${whoApproved} ha aprobado el trabajo "${jobTitle}". Esperando la otra parte.`,
        });
        
        // Also notify the other party specifically
        const otherUserId = isClient ? job.provider?.id : job.client.id;
        if (otherUserId) {
          notifyUser(otherUserId, 'job-approval-update', {
            jobId: updatedJob.id,
            jobTitle: jobTitle,
            message: `El ${whoApproved} ha aprobado el trabajo "${jobTitle}". Esperando tu aprobación.`,
          });
        }
        console.log('📢 Broadcasted job approval update to all users');
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }

    return NextResponse.json(updatedJob);
  } catch (error: any) {
    console.error('Error completing job:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

