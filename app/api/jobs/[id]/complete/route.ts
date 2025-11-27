import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JobStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';

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

    // Update job status to COMPLETED
    const updatedJob = await prisma.job.update({
      where: { id: params.id },
      data: {
        status: JobStatus.COMPLETED,
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

    return NextResponse.json(updatedJob);
  } catch (error: any) {
    console.error('Error completing job:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

