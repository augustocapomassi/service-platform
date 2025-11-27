import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Specialty, JobStatus } from '@prisma/client';
import { broadcast } from '@/server/socket-wrapper';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const clientId = searchParams.get('clientId');
    const providerId = searchParams.get('providerId');

    const where: any = {};

    if (status && Object.values(JobStatus).includes(status as JobStatus)) {
      where.status = status as JobStatus;
    }

    if (category && Object.values(Specialty).includes(category as Specialty)) {
      where.category = category as Specialty;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (providerId) {
      where.providerId = providerId;
    }

    const jobs = await prisma.job.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            email: true,
            walletAddress: true,
            clientScore: true,
          },
        },
        provider: {
          select: {
            id: true,
            email: true,
            walletAddress: true,
            providerScore: true,
          },
        },
        reviews: {
          include: {
            reviewer: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
        // Proposals - only include if table exists (will be empty array if table doesn't exist)
        proposals: {
          select: {
            id: true,
            message: true,
            proposedAmount: true,
            counterOfferAmount: true,
            status: true,
            rejectedAt: true,
            provider: {
              select: {
                id: true,
                email: true,
                walletAddress: true,
                providerScore: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, category, amount, clientId } = body;

    // Validation
    if (!title || !description || !category || !amount || !clientId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!Object.values(Specialty).includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    // Convert amount to wei (for storage consistency)
    const { ethers } = await import('ethers');
    const amountInWei = ethers.parseEther(amount.toString());

    // Create job in DB only (no blockchain yet - that happens when provider is accepted)
    const job = await prisma.job.create({
      data: {
        title,
        description,
        category: category as Specialty,
        amount: amountInWei.toString(),
        status: JobStatus.PENDING,
        clientId,
        providerId: null, // No provider yet
        txHash: null, // No blockchain transaction yet
      },
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
            email: true,
            walletAddress: true,
          },
        },
      },
    });

    // Broadcast new job to all connected users
    try {
      broadcast('new-job-created', {
        jobId: job.id,
        title: job.title,
        category: job.category,
        amount: job.amount,
        client: {
          id: job.client.id,
          email: job.client.email,
        },
      });
      console.log('📢 Broadcasted new job to all users:', job.id);
    } catch (error) {
      console.error('Error broadcasting new job:', error);
      // Don't fail the request if broadcast fails
    }

    return NextResponse.json(job, { status: 201 });
  } catch (error: any) {
    console.error('Error creating job:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack,
    });
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message || 'Unknown error',
        code: error.code || 'UNKNOWN',
      },
      { status: 500 }
    );
  }
}


