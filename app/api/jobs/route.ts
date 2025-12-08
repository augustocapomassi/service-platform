import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Specialty, JobStatus } from '@prisma/client';
import { broadcast } from '@/server/socket-wrapper';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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
  console.log('🚀 ========== POST /api/jobs CALLED ==========');
  try {
    // Get token from cookie
    const token = request.cookies.get('auth-token')?.value;
    console.log('🚀 Token found:', !!token);

    if (!token) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // Verify token and get userId
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

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, description, category, amount } = body;

    // Validation
    if (!title || !description || !category || !amount) {
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
    console.log('🚀 About to create job in database...');
    const job = await prisma.job.create({
      data: {
        title,
        description,
        category: category as Specialty,
        amount: amountInWei.toString(),
        status: JobStatus.PENDING,
        clientId: userId, // Use authenticated user's ID
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

    console.log('🚀 Job created successfully in database:', job.id);
    console.log('🚀 Job title:', job.title);
    console.log('🚀 About to broadcast new job...');
    console.log('🚀 Broadcast function type:', typeof broadcast);
    console.log('🚀 Broadcast function:', broadcast);
    
    // CRITICAL: Write to stderr to ensure it appears
    process.stderr.write(`\n🚀 [STDERR] Job created: ${job.id}\n`);
    process.stderr.write(`🚀 [STDERR] About to broadcast\n`);

    // Broadcast new job to all connected users
    console.log('\n📢 ========== STARTING BROADCAST ==========');
    console.log('📢 This log should appear BEFORE the try block');
    console.log('📢 Job ID:', job.id);
    console.log('📢 Job title:', job.title);
    
    // Force flush to ensure logs appear
    process.stdout.write('📢 FORCE FLUSH: About to enter try block\n');
    process.stderr.write('📢 [STDERR] FORCE FLUSH: About to enter try block\n');
    
    try {
      console.log('📢 Step 1: About to call broadcast function...');
      const eventData = {
        jobId: job.id,
        title: job.title,
        category: job.category,
        amount: job.amount,
        client: {
          id: job.client.id,
          email: job.client.email,
        },
      };
      console.log('📢 Step 2: Event data prepared:', JSON.stringify(eventData, null, 2));
      
      console.log('📢 Step 3: Calling broadcast function...');
      console.log('📢 Step 3.1: Import check - broadcast function exists:', typeof broadcast);
      console.log('📢 Step 3.2: About to call broadcast with event:', 'new-job-created');
      console.log('📢 Step 3.3: Event data:', JSON.stringify(eventData, null, 2));
      process.stdout.write('📢 FORCE FLUSH: About to call broadcast()\n');
      
      // First, verify socket.io is initialized
      console.log('📢 Step 3.5: Verifying Socket.IO is available...');
      process.stderr.write('📢 [STDERR] Step 3.5: Verifying Socket.IO\n');
      try {
        const { getIO } = require('@/server/socket-wrapper');
        process.stderr.write('📢 [STDERR] getIO imported successfully\n');
        const io = getIO();
        process.stderr.write(`📢 [STDERR] getIO() returned: ${io ? 'YES' : 'NO'}\n`);
        console.log('📢 Step 3.6: Socket.IO instance retrieved:', io ? 'YES' : 'NO');
        console.log('📢 Step 3.7: Connected sockets:', io?.sockets?.sockets?.size || 0);
        process.stderr.write(`📢 [STDERR] Connected sockets: ${io?.sockets?.sockets?.size || 0}\n`);
        
        // Test direct emit
        if (io && io.sockets && io.sockets.sockets.size > 0) {
          console.log('📢 Step 3.8: Testing direct emit...');
          process.stderr.write('📢 [STDERR] Testing direct emit\n');
          io.emit('test-direct-emit', { message: 'Direct emit test', timestamp: Date.now() });
          console.log('✅ Direct emit test sent');
          process.stderr.write('📢 [STDERR] Direct emit sent\n');
        } else {
          console.warn('⚠️ No connected sockets, cannot test direct emit');
          process.stderr.write('⚠️ [STDERR] No connected sockets\n');
        }
      } catch (ioError: any) {
        console.error('❌ Error getting IO:', ioError);
        process.stderr.write(`❌ [STDERR] Error getting IO: ${ioError?.message}\n`);
        process.stderr.write(`❌ [STDERR] Error stack: ${ioError?.stack}\n`);
      }
      
      // First, test if broadcast function works with a test event
      console.log('📢 Step 3.9: Testing broadcast with test event first...');
      try {
        broadcast('test-broadcast-from-api', { message: 'Test from API route', timestamp: Date.now() });
        console.log('✅ Test broadcast successful, now sending real event...');
      } catch (testError: any) {
        console.error('❌ Test broadcast failed:', testError);
        console.error('❌ Test broadcast error stack:', testError?.stack);
        // Don't throw, continue with real event
      }
      
      console.log('📢 Step 3.10: Calling broadcast for new-job-created...');
      const broadcastResult = broadcast('new-job-created', eventData);
      process.stdout.write('📢 FORCE FLUSH: broadcast() returned\n');
      console.log('📢 Step 3.4: Broadcast returned:', broadcastResult);
      
      console.log('📢 Step 4: Broadcast function returned (no error thrown)');
      console.log('✅ Broadcasted new job to all users:', job.id);
    } catch (error: any) {
      console.error('\n❌ ========== ERROR IN BROADCAST ==========');
      console.error('❌ Error type:', typeof error);
      console.error('❌ Error:', error);
      console.error('❌ Error message:', error?.message);
      console.error('❌ Error name:', error?.name);
      console.error('❌ Error stack:', error?.stack);
      console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      // Don't fail the request if broadcast fails
    }
    console.log('📢 ========== BROADCAST ATTEMPT COMPLETE ==========\n');

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


