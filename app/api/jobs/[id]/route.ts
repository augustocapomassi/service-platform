import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JobStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { broadcast } from '@/server/socket-wrapper';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function DELETE(
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
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Trabajo no encontrado' },
        { status: 404 }
      );
    }

    // Verify job is in PENDING status
    if (job.status !== JobStatus.PENDING) {
      return NextResponse.json(
        { error: 'Solo se pueden eliminar trabajos en estado pendiente' },
        { status: 400 }
      );
    }

    // Verify user is the creator (client)
    if (job.client.id !== userId) {
      return NextResponse.json(
        { error: 'No tienes permiso para eliminar este trabajo' },
        { status: 403 }
      );
    }

    // Delete the job (cascade will handle related records like proposals and reviews)
    await prisma.job.delete({
      where: { id: params.id },
    });

    // Broadcast job deletion to all connected users
    try {
      broadcast('job-deleted', {
        jobId: params.id,
      });
      console.log('📢 Broadcasted job deletion to all users:', params.id);
    } catch (error) {
      console.error('Error broadcasting job deletion:', error);
    }

    return NextResponse.json({ message: 'Trabajo eliminado correctamente' });
  } catch (error: any) {
    console.error('Error deleting job:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
