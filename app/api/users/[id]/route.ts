import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Specialty } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        walletAddress: true,
        specialties: true,
        clientScore: true,
        providerScore: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { specialties } = body;

    // Validate specialties
    if (specialties && Array.isArray(specialties)) {
      const validSpecialties = Object.values(Specialty);
      const invalidSpecialties = specialties.filter(
        (s: string) => !validSpecialties.includes(s as Specialty)
      );

      if (invalidSpecialties.length > 0) {
        return NextResponse.json(
          { error: 'Invalid specialties' },
          { status: 400 }
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: {
        specialties: specialties || undefined,
      },
      select: {
        id: true,
        email: true,
        walletAddress: true,
        specialties: true,
        clientScore: true,
        providerScore: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


