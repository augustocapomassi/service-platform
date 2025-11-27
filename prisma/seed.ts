import { PrismaClient, Specialty, JobStatus, ReviewRole } from '@prisma/client';
import { ethers } from 'ethers';
import bcrypt from 'bcryptjs';
import { generateWallet } from '../lib/web3/wallet';
import { ESCROW_ABI } from '../lib/web3/utils';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data
  await prisma.review.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
  console.log('🧹 Cleared existing data');

  // Setup Web3 provider and contract
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contractAddress = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS;

  // Get test accounts from Anvil (default accounts)
  const accounts = [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  ];

  // Create users
  console.log('👥 Creating users...');

  // 1. Juan (Cliente) - Sin especialidades
  const juanWallet = await generateWallet();
  const juanPassword = await bcrypt.hash('juan123', 10);
  const juan = await prisma.user.create({
    data: {
      email: 'juan@example.com',
      password: juanPassword,
      walletAddress: accounts[0] || juanWallet.address,
      encryptedPrivateKey: juanWallet.encryptedPrivateKey,
      specialties: [], // Solo cliente
      clientScore: 0.0,
      providerScore: 0.0,
    },
  });
  console.log('✅ Created Juan (Cliente)');

  // 2. Maria (Electricista) - Especialidad ELECTRICIDAD, Ranking inicial 4.5
  const mariaWallet = await generateWallet();
  const mariaPassword = await bcrypt.hash('maria123', 10);
  const maria = await prisma.user.create({
    data: {
      email: 'maria@example.com',
      password: mariaPassword,
      walletAddress: accounts[1] || mariaWallet.address,
      encryptedPrivateKey: mariaWallet.encryptedPrivateKey,
      specialties: [Specialty.ELECTRICIDAD],
      clientScore: 0.0,
      providerScore: 4.5, // Ranking inicial como proveedor
    },
  });
  console.log('✅ Created Maria (Electricista)');

  // 3. Pedro (Todero) - Especialidades PLOMERIA y MANTENIMIENTO
  const pedroWallet = await generateWallet();
  const pedroPassword = await bcrypt.hash('pedro123', 10);
  const pedro = await prisma.user.create({
    data: {
      email: 'pedro@example.com',
      password: pedroPassword,
      walletAddress: accounts[2] || pedroWallet.address,
      encryptedPrivateKey: pedroWallet.encryptedPrivateKey,
      specialties: [Specialty.PLOMERIA, Specialty.MANTENIMIENTO],
      clientScore: 0.0,
      providerScore: 0.0,
    },
  });
  console.log('✅ Created Pedro (Todero)');

  // Create jobs (if contract address is provided, interact with blockchain)
  console.log('💼 Creating jobs...');

  if (contractAddress) {
    console.log(`📝 Interacting with contract at ${contractAddress}`);
    const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);
    
    // Job 1: Juan -> Maria (Electricidad) - COMPLETED
    const amount1 = ethers.parseEther('0.1'); // 0.1 ETH
    const job1 = await prisma.job.create({
      data: {
        title: 'Reparación eléctrica en cocina',
        description: 'Necesito reparar el sistema eléctrico de la cocina, hay un corto circuito',
        category: Specialty.ELECTRICIDAD,
        amount: amount1.toString(),
        status: JobStatus.COMPLETED,
        txHash: null, // Will be updated if we create on-chain
        clientId: juan.id,
        providerId: maria.id,
      },
    });

    // Simulate creating job on-chain (in real scenario, this would be done via UI)
    // For seed, we'll just create in DB with status COMPLETED
    console.log(`✅ Created Job 1: ${job1.title}`);

    // Job 2: Juan -> Pedro (Plomería) - COMPLETED
    const amount2 = ethers.parseEther('0.15');
    const job2 = await prisma.job.create({
      data: {
        title: 'Reparación de tubería',
        description: 'Fuga en el baño, necesita reparación urgente',
        category: Specialty.PLOMERIA,
        amount: amount2.toString(),
        status: JobStatus.COMPLETED,
        txHash: null,
        clientId: juan.id,
        providerId: pedro.id,
      },
    });
    console.log(`✅ Created Job 2: ${job2.title}`);

    // Job 3: Maria -> Pedro (Mantenimiento) - IN_PROGRESS
    const amount3 = ethers.parseEther('0.2');
    const job3 = await prisma.job.create({
      data: {
        title: 'Mantenimiento general',
        description: 'Mantenimiento preventivo de instalaciones',
        category: Specialty.MANTENIMIENTO,
        amount: amount3.toString(),
        status: JobStatus.IN_PROGRESS,
        txHash: null,
        clientId: maria.id,
        providerId: pedro.id,
      },
    });
    console.log(`✅ Created Job 3: ${job3.title}`);

    // Create reviews for completed jobs
    console.log('⭐ Creating reviews...');

    // Review 1: Juan -> Maria (CLIENT_TO_PROVIDER) - 5 estrellas
    await prisma.review.create({
      data: {
        rating: 5,
        comment: 'Excelente trabajo, muy profesional y puntual. Recomendado!',
        role: ReviewRole.CLIENT_TO_PROVIDER,
        jobId: job1.id,
        reviewerId: juan.id,
        reviewedUserId: maria.id,
      },
    });

    // Review 2: Maria -> Juan (PROVIDER_TO_CLIENT) - 4 estrellas
    await prisma.review.create({
      data: {
        rating: 4,
        comment: 'Cliente respetuoso y claro en sus requerimientos.',
        role: ReviewRole.PROVIDER_TO_CLIENT,
        jobId: job1.id,
        reviewerId: maria.id,
        reviewedUserId: juan.id,
      },
    });

    // Review 3: Juan -> Pedro (CLIENT_TO_PROVIDER) - 4 estrellas
    await prisma.review.create({
      data: {
        rating: 4,
        comment: 'Buen servicio, resolvió el problema rápidamente.',
        role: ReviewRole.CLIENT_TO_PROVIDER,
        jobId: job2.id,
        reviewerId: juan.id,
        reviewedUserId: pedro.id,
      },
    });

    // Review 4: Pedro -> Juan (PROVIDER_TO_CLIENT) - 5 estrellas
    await prisma.review.create({
      data: {
        rating: 5,
        comment: 'Cliente excelente, muy comunicativo.',
        role: ReviewRole.PROVIDER_TO_CLIENT,
        jobId: job2.id,
        reviewerId: pedro.id,
        reviewedUserId: juan.id,
      },
    });

    console.log('✅ Created reviews');

    // Recalculate scores
    console.log('📊 Recalculating scores...');
    
    // Update Maria's provider score (already has initial 4.5, but we have one 5-star review)
    const mariaReviews = await prisma.review.findMany({
      where: {
        reviewedUserId: maria.id,
        role: ReviewRole.CLIENT_TO_PROVIDER,
      },
    });
    const mariaAvgScore = mariaReviews.length > 0
      ? mariaReviews.reduce((sum, r) => sum + r.rating, 0) / mariaReviews.length
      : 0;
    await prisma.user.update({
      where: { id: maria.id },
      data: { providerScore: mariaAvgScore || 4.5 },
    });

    // Update Pedro's provider score
    const pedroReviews = await prisma.review.findMany({
      where: {
        reviewedUserId: pedro.id,
        role: ReviewRole.CLIENT_TO_PROVIDER,
      },
    });
    const pedroAvgScore = pedroReviews.length > 0
      ? pedroReviews.reduce((sum, r) => sum + r.rating, 0) / pedroReviews.length
      : 0;
    await prisma.user.update({
      where: { id: pedro.id },
      data: { providerScore: pedroAvgScore },
    });

    // Update Juan's client score
    const juanReviews = await prisma.review.findMany({
      where: {
        reviewedUserId: juan.id,
        role: ReviewRole.PROVIDER_TO_CLIENT,
      },
    });
    const juanAvgScore = juanReviews.length > 0
      ? juanReviews.reduce((sum, r) => sum + r.rating, 0) / juanReviews.length
      : 0;
    await prisma.user.update({
      where: { id: juan.id },
      data: { clientScore: juanAvgScore },
    });

    console.log('✅ Scores recalculated');
  } else {
    console.log('⚠️  Contract address not provided, skipping blockchain interactions');
    console.log('   Set NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS in .env to create on-chain jobs');
  }

  console.log('🎉 Seed completed successfully!');
  console.log('\n📋 Test Users:');
  console.log('   Juan (Cliente): juan@example.com / juan123');
  console.log('   Maria (Electricista): maria@example.com / maria123');
  console.log('   Pedro (Todero): pedro@example.com / pedro123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

