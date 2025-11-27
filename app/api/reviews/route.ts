import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ReviewRole, JobStatus } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, reviewedUserId, rating, comment, role, reviewerId } = body;

    // Validation
    if (!jobId || !reviewedUserId || !rating || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    // Verify job exists and is completed
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { client: true, provider: true },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== JobStatus.COMPLETED) {
      return NextResponse.json(
        { error: 'Can only review completed jobs' },
        { status: 400 }
      );
    }

    // Determine reviewer based on role
    let actualReviewerId = reviewerId;
    if (!actualReviewerId) {
      if (role === ReviewRole.CLIENT_TO_PROVIDER) {
        actualReviewerId = job.clientId;
      } else {
        actualReviewerId = job.providerId;
      }
    }

    if (!actualReviewerId) {
      return NextResponse.json(
        { error: 'Could not determine reviewer' },
        { status: 400 }
      );
    }

    // Check if review already exists
    const existingReview = await prisma.review.findUnique({
      where: {
        jobId_reviewerId_role: {
          jobId,
          reviewerId: actualReviewerId,
          role,
        },
      },
    });

    if (existingReview) {
      return NextResponse.json(
        { error: 'Review already exists for this job and role' },
        { status: 400 }
      );
    }

    // Create review
    const review = await prisma.review.create({
      data: {
        jobId,
        reviewerId: actualReviewerId,
        reviewedUserId,
        rating,
        comment: comment || null,
        role,
      },
      include: {
        reviewedUser: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    // Recalculate scores
    await recalculateScores(reviewedUserId, role);

    return NextResponse.json(review, { status: 201 });
  } catch (error: any) {
    console.error('Error creating review:', error);
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Review already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

async function recalculateScores(userId: string, role: ReviewRole) {
  // Recalculate client score
  if (role === ReviewRole.PROVIDER_TO_CLIENT) {
    const clientReviews = await prisma.review.findMany({
      where: {
        reviewedUserId: userId,
        role: ReviewRole.PROVIDER_TO_CLIENT,
      },
    });

    if (clientReviews.length > 0) {
      const avgScore =
        clientReviews.reduce((sum, r) => sum + r.rating, 0) /
        clientReviews.length;

      await prisma.user.update({
        where: { id: userId },
        data: { clientScore: avgScore },
      });
    }
  }

  // Recalculate provider score
  if (role === ReviewRole.CLIENT_TO_PROVIDER) {
    const providerReviews = await prisma.review.findMany({
      where: {
        reviewedUserId: userId,
        role: ReviewRole.CLIENT_TO_PROVIDER,
      },
    });

    if (providerReviews.length > 0) {
      const avgScore =
        providerReviews.reduce((sum, r) => sum + r.rating, 0) /
        providerReviews.length;

      await prisma.user.update({
        where: { id: userId },
        data: { providerScore: avgScore },
      });
    }
  }
}


