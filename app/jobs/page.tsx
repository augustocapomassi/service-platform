'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import ReviewModal from '@/components/ReviewModal';
import CreateJobModal from '@/components/CreateJobModal';
import ProposalModal from '@/components/ProposalModal';
import ProposalActionsModal from '@/components/ProposalActionsModal';
import CounterOfferResponseModal from '@/components/CounterOfferResponseModal';
import NotificationToast from '@/components/NotificationToast';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { JobStatus, ReviewRole, Specialty } from '@prisma/client';
import { getCategoryImage } from '@/lib/category-images';
import Image from 'next/image';

interface Job {
  id: string;
  title: string;
  description: string;
  category: Specialty;
  status: JobStatus;
  amount: string;
  client: {
    id: string;
    email: string;
  };
  provider: {
    id: string;
    email: string;
  } | null;
  reviews: any[];
  proposals?: Array<{
    id: string;
    message: string | null;
    proposedAmount: string | null;
    counterOfferAmount: string | null;
    status: string;
    rejectedAt: string | null;
    provider: {
      id: string;
      email: string;
      providerScore: number;
    };
  }>;
}

const STATUS_LABELS: Record<JobStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En Progreso',
  COMPLETED: 'Completado',
  DISPUTED: 'En Disputa',
  CANCELLED: 'Cancelado',
};

type TabType = 'my-jobs' | 'in-progress' | 'available' | 'completed';

export default function JobsPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { notifications, requestNotificationPermission, removeNotification } = useNotifications(user?.id || null);
  const [activeTab, setActiveTab] = useState<TabType>('my-jobs');
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [proposalModal, setProposalModal] = useState<{
    isOpen: boolean;
    jobId: string;
    jobTitle: string;
    jobAmount: string;
  } | null>(null);
  const [proposalActionsModal, setProposalActionsModal] = useState<{
    isOpen: boolean;
    proposalId: string;
    jobTitle: string;
    currentAmount: string;
    proposedAmount: string | null;
  } | null>(null);
  const [counterOfferModal, setCounterOfferModal] = useState<{
    isOpen: boolean;
    proposalId: string;
    jobTitle: string;
    counterOfferAmount: string;
    originalAmount: string;
  } | null>(null);
  const [counterOfferResponseModal, setCounterOfferResponseModal] = useState<{
    isOpen: boolean;
    proposalId: string;
    jobTitle: string;
    counterOfferAmount: string;
  } | null>(null);
  const [reviewModal, setReviewModal] = useState<{
    isOpen: boolean;
    jobId: string;
    jobTitle: string;
    reviewedUserId: string;
    reviewedUserName: string;
    role: ReviewRole;
  } | null>(null);

  const fetchJobs = async () => {
    if (!user) return;
    
    try {
      // Fetch all jobs that might be relevant
      const [myJobsRes, inProgressRes, availableRes, completedRes] = await Promise.all([
        fetch(`/api/jobs?clientId=${user.id}`), // My jobs as client
        fetch('/api/jobs?status=IN_PROGRESS'), // All in-progress jobs
        fetch('/api/jobs?status=PENDING'), // All pending jobs
        fetch('/api/jobs?status=COMPLETED'), // All completed jobs
      ]);

      const myJobs = myJobsRes.ok ? await myJobsRes.json() : [];
      const inProgressJobs = inProgressRes.ok ? await inProgressRes.json() : [];
      const availableJobs = availableRes.ok ? await availableRes.json() : [];
      const completedJobs = completedRes.ok ? await completedRes.json() : [];

      // Combine all jobs (deduplicate by id)
      const jobsMap = new Map<string, Job>();
      
      [...myJobs, ...inProgressJobs, ...availableJobs, ...completedJobs].forEach((job: Job) => {
        if (!jobsMap.has(job.id)) {
          jobsMap.set(job.id, job);
        }
      });

      setAllJobs(Array.from(jobsMap.values()));
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      fetchJobs();
      // Request browser notification permission
      requestNotificationPermission();
    }
  }, [user, authLoading, router, requestNotificationPermission]);

  // Filter jobs based on active tab
  const filteredJobs = allJobs.filter((job) => {
    if (!user) return false;

    switch (activeTab) {
      case 'my-jobs':
        // Jobs where I'm the client
        return job.client.id === user.id;

      case 'in-progress':
        // Jobs in progress where I'm either client or provider
        return (
          job.status === JobStatus.IN_PROGRESS &&
          (job.client.id === user.id || job.provider?.id === user.id)
        );

      case 'available':
        // Pending jobs from other users where I can apply
        return (
          job.status === JobStatus.PENDING &&
          job.client.id !== user.id &&
          (!job.provider || job.provider.id !== user.id)
        );

      case 'completed':
        // Completed jobs where I'm either client or provider
        return (
          job.status === JobStatus.COMPLETED &&
          (job.client.id === user.id || job.provider?.id === user.id)
        );

      default:
        return false;
    }
  });

  // Listen for real-time proposal notifications and refresh jobs
  useEffect(() => {
    const handleProposalReceived = (event: CustomEvent) => {
      fetchJobs(); // Refresh jobs when a new proposal is received
    };

    const handleJobUpdated = (event: CustomEvent) => {
      fetchJobs(); // Refresh jobs when job is updated (e.g., accepted)
    };

    const handleCounterofferReceived = (event: CustomEvent) => {
      fetchJobs(); // Refresh jobs when counteroffer is received
    };

    const handleCounterofferRejected = (event: CustomEvent) => {
      fetchJobs(); // Refresh jobs when counteroffer is rejected
    };

    window.addEventListener('job-proposal-received', handleProposalReceived as EventListener);
    window.addEventListener('job-updated', handleJobUpdated as EventListener);
    window.addEventListener('counteroffer-received', handleCounterofferReceived as EventListener);
    window.addEventListener('counteroffer-rejected', handleCounterofferRejected as EventListener);
    
    return () => {
      window.removeEventListener('job-proposal-received', handleProposalReceived as EventListener);
      window.removeEventListener('job-updated', handleJobUpdated as EventListener);
      window.removeEventListener('counteroffer-received', handleCounterofferReceived as EventListener);
      window.removeEventListener('counteroffer-rejected', handleCounterofferRejected as EventListener);
    };
  }, []);

  const handleReview = (job: Job, role: ReviewRole) => {
    if (role === ReviewRole.CLIENT_TO_PROVIDER && job.provider) {
      setReviewModal({
        isOpen: true,
        jobId: job.id,
        jobTitle: job.title,
        reviewedUserId: job.provider.id,
        reviewedUserName: job.provider.email,
        role,
      });
    } else if (role === ReviewRole.PROVIDER_TO_CLIENT) {
      setReviewModal({
        isOpen: true,
        jobId: job.id,
        jobTitle: job.title,
        reviewedUserId: job.client.id,
        reviewedUserName: job.client.email,
        role,
      });
    }
  };

  const formatAmount = (amount: string) => {
    try {
      const wei = BigInt(amount);
      const eth = Number(wei) / 1e18;
      return `${eth.toFixed(4)} ETH`;
    } catch {
      return amount;
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      
      {/* Notification Toast */}
      {notifications.length > 0 && (
        <NotificationToast
          notifications={notifications}
          onDismiss={(id) => {
            // This will be handled by the hook's clearNotifications
          }}
        />
      )}

      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Trabajos</h1>
          {user && activeTab === 'my-jobs' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              + Crear Trabajo
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('my-jobs')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === 'my-jobs'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              Mis Trabajos
              {user && (
                <span className="ml-2 py-0.5 px-2.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800">
                  {allJobs.filter((j) => j.client.id === user.id).length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('in-progress')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === 'in-progress'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              En Proceso
              {user && (
                <span className="ml-2 py-0.5 px-2.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800">
                  {
                    allJobs.filter(
                      (j) =>
                        j.status === JobStatus.IN_PROGRESS &&
                        (j.client.id === user.id || j.provider?.id === user.id)
                    ).length
                  }
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('available')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === 'available'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              Disponibles para Postularse
              {user && (
                <span className="ml-2 py-0.5 px-2.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800">
                  {
                    allJobs.filter(
                      (j) =>
                        j.status === JobStatus.PENDING &&
                        j.client.id !== user.id &&
                        (!j.provider || j.provider.id !== user.id)
                    ).length
                  }
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === 'completed'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              Finalizados
              {user && (
                <span className="ml-2 py-0.5 px-2.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800">
                  {
                    allJobs.filter(
                      (j) =>
                        j.status === JobStatus.COMPLETED &&
                        (j.client.id === user.id || j.provider?.id === user.id)
                    ).length
                  }
                </span>
              )}
            </button>
          </nav>
        </div>

        <div className="grid gap-6">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
            >
              {/* Category Image */}
              <div className="relative w-full h-48 bg-gray-200 dark:bg-gray-700">
                <Image
                  src={getCategoryImage(job.category)}
                  alt={job.category}
                  fill
                  className="object-cover"
                  unoptimized
                />
                <div className="absolute top-4 right-4">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      job.status === JobStatus.COMPLETED
                        ? 'bg-green-100 text-green-800'
                        : job.status === JobStatus.IN_PROGRESS
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {STATUS_LABELS[job.status]}
                  </span>
                </div>
              </div>

              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{job.title}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {job.category}
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                      {job.description}
                    </p>
                  </div>
                </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Cliente:</p>
                  <p className="font-medium">{job.client.email}</p>
                </div>
                {job.provider && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Proveedor:</p>
                    <p className="font-medium">{job.provider.email}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Presupuesto:</p>
                  <p className="font-medium">{formatAmount(job.amount)}</p>
                </div>
                {!job.provider && job.proposals && job.proposals.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Postulaciones:</p>
                    <p className="font-medium">{job.proposals.length}</p>
                  </div>
                )}
              </div>

              {/* Mostrar postulaciones si el trabajo no tiene proveedor asignado */}
              {!job.provider && job.proposals && job.proposals.length > 0 && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium mb-2">Postulaciones de Proveedores:</p>
                  <div className="space-y-2">
                    {job.proposals.map((proposal) => (
                      <div key={proposal.id} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium">{proposal.provider.email}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Calificación: {proposal.provider.providerScore.toFixed(1)} ⭐
                            </p>
                            {proposal.message && (
                              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                                {proposal.message}
                              </p>
                            )}
                            {proposal.proposedAmount && !proposal.counterOfferAmount && (
                              <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mt-1">
                                Propone: {formatAmount(proposal.proposedAmount)}
                              </p>
                            )}
                            {proposal.counterOfferAmount && (
                              <div className="mt-1">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  Tu propuesta: {formatAmount(proposal.proposedAmount || job.amount)}
                                </p>
                                <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                                  Contraoferta: {formatAmount(proposal.counterOfferAmount)}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                proposal.status === 'ACCEPTED'
                                  ? 'bg-green-100 text-green-800'
                                  : proposal.status === 'REJECTED'
                                  ? 'bg-red-100 text-red-800'
                                  : proposal.status === 'COUNTEROFFERED'
                                  ? 'bg-orange-100 text-orange-800'
                                  : proposal.status === 'COUNTEROFFER_REJECTED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {proposal.status === 'ACCEPTED'
                              ? 'Aceptada'
                              : proposal.status === 'REJECTED'
                              ? 'Rechazada'
                              : proposal.status === 'COUNTEROFFERED'
                              ? 'Contraoferta'
                              : proposal.status === 'COUNTEROFFER_REJECTED'
                              ? 'Contraoferta Rechazada'
                              : 'Pendiente'}
                            </span>
                            {/* Show action buttons if user is the client and proposal is pending */}
                            {user &&
                              user.id === job.client.id &&
                              proposal.status === 'PENDING' && (
                                <button
                                  onClick={() =>
                                    setProposalActionsModal({
                                      isOpen: true,
                                      proposalId: proposal.id,
                                      jobTitle: job.title,
                                      currentAmount: job.amount,
                                      proposedAmount: proposal.proposedAmount,
                                    })
                                  }
                                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                >
                                  Gestionar
                                </button>
                              )}
                            {/* Show action buttons if user is the provider and proposal has counteroffer */}
                            {user &&
                              user.id === proposal.provider.id &&
                              proposal.status === 'COUNTEROFFERED' &&
                              proposal.counterOfferAmount && (
                                <button
                                  onClick={() =>
                                    setCounterOfferResponseModal({
                                      isOpen: true,
                                      proposalId: proposal.id,
                                      jobTitle: job.title,
                                      counterOfferAmount: proposal.counterOfferAmount!,
                                    })
                                  }
                                  className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700"
                                >
                                  Responder
                                </button>
                              )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sección de postulaciones - solo si no tiene proveedor asignado */}
              {!job.provider && (
                <div className="border-t pt-4 mt-4">
                  {/* Si el usuario es el cliente, mostrar estado de postulaciones */}
                  {user && user.id === job.client.id && (
                    <>
                      {job.proposals && job.proposals.length > 0 ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          Tienes {job.proposals.length} postulación{job.proposals.length > 1 ? 'es' : ''} pendiente{job.proposals.length > 1 ? 's' : ''}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                          Aún no hay postulaciones para este trabajo
                        </p>
                      )}
                    </>
                  )}
                  
                  {/* Si el usuario NO es el cliente, mostrar botón de postulación */}
                  {user && user.id !== job.client.id && (
                    <>
                      {job.proposals && job.proposals.some((p: any) => {
                        // Check if user has an active proposal (not rejected with cooldown)
                        if (p.provider.id === user.id) {
                          if (p.status === 'COUNTEROFFER_REJECTED') {
                            // Check if 24 hours have passed
                            // We'll need to check this on the server, but for UI we can show message
                            return true; // Still show as proposed but disabled
                          }
                          return true;
                        }
                        return false;
                      }) ? (
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                          {job.proposals?.find((p: any) => p.provider.id === user.id)?.status === 'COUNTEROFFER_REJECTED' ? (
                            <p className="text-sm text-orange-700 dark:text-orange-300">
                              ⏰ Has rechazado la contraoferta. Puedes postularte nuevamente después de 24 horas.
                            </p>
                          ) : (
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                              ✅ Ya te has postulado a este trabajo
                            </p>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => setProposalModal({
                            isOpen: true,
                            jobId: job.id,
                            jobTitle: job.title,
                            jobAmount: job.amount,
                          })}
                          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                        >
                          Postularme a este Trabajo
                        </button>
                      )}
                    </>
                  )}

                  {/* Si no hay usuario autenticado */}
                  {!user && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      Inicia sesión para postularte a este trabajo
                    </p>
                  )}
                </div>
              )}

              {/* Button to complete job if in progress */}
              {job.status === JobStatus.IN_PROGRESS && (
                <div className="border-t pt-4 mt-4">
                  {user && (
                    <>
                      {(user.id === job.client.id || user.id === job.provider?.id) && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/jobs/${job.id}/complete`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                              });
                              if (res.ok) {
                                fetchJobs();
                                alert('Trabajo marcado como completado!');
                              } else {
                                const error = await res.json();
                                alert(error.error || 'Error al completar el trabajo');
                              }
                            } catch (error) {
                              console.error('Error completing job:', error);
                              alert('Error al completar el trabajo');
                            }
                          }}
                          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                        >
                          ✅ Marcar como Completado
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {job.status === JobStatus.COMPLETED && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    ¿Dejar reseña?
                  </p>
                  <div className="flex gap-2">
                    {job.provider && (
                      <button
                        onClick={() => handleReview(job, ReviewRole.CLIENT_TO_PROVIDER)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        Calificar Proveedor
                      </button>
                    )}
                    <button
                      onClick={() => handleReview(job, ReviewRole.PROVIDER_TO_CLIENT)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      Calificar Cliente
                    </button>
                  </div>
                </div>
              )}

              {job.reviews.length > 0 && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium mb-2">Reseñas:</p>
                  {job.reviews.map((review) => (
                    <div key={review.id} className="mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-400">
                          {'★'.repeat(review.rating)}
                          {'☆'.repeat(5 - review.rating)}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {review.reviewer.email}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                          {review.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          ))}
        </div>

        {filteredJobs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {activeTab === 'my-jobs' && 'No has creado ningún trabajo aún.'}
              {activeTab === 'in-progress' && 'No tienes trabajos en proceso.'}
              {activeTab === 'available' && 'No hay trabajos disponibles para postularse en este momento.'}
              {activeTab === 'completed' && 'No tienes trabajos finalizados aún.'}
            </p>
            {user && activeTab === 'my-jobs' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                + Crear Primer Trabajo
              </button>
            )}
          </div>
        )}
      </div>

      {reviewModal && (
        <ReviewModal
          jobId={reviewModal.jobId}
          jobTitle={reviewModal.jobTitle}
          reviewedUserId={reviewModal.reviewedUserId}
          reviewedUserName={reviewModal.reviewedUserName}
          role={reviewModal.role}
          isOpen={reviewModal.isOpen}
          onClose={() => setReviewModal(null)}
          onSuccess={() => {
            fetchJobs();
            setReviewModal(null);
          }}
        />
      )}

      {showCreateModal && user && (
        <CreateJobModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            fetchJobs();
            setShowCreateModal(false);
          }}
          clientId={user.id}
        />
      )}

      {proposalModal && user && (
        <ProposalModal
          jobId={proposalModal.jobId}
          jobTitle={proposalModal.jobTitle}
          jobAmount={proposalModal.jobAmount}
          isOpen={proposalModal.isOpen}
          onClose={() => setProposalModal(null)}
          onSuccess={() => {
            fetchJobs();
            setProposalModal(null);
          }}
          providerId={user.id}
        />
      )}

      {proposalActionsModal && (
        <ProposalActionsModal
          proposalId={proposalActionsModal.proposalId}
          jobTitle={proposalActionsModal.jobTitle}
          currentAmount={proposalActionsModal.currentAmount}
          proposedAmount={proposalActionsModal.proposedAmount}
          isOpen={proposalActionsModal.isOpen}
          onClose={() => setProposalActionsModal(null)}
          onSuccess={() => {
            fetchJobs();
            setProposalActionsModal(null);
          }}
        />
      )}

      {counterOfferResponseModal && (
        <CounterOfferResponseModal
          proposalId={counterOfferResponseModal.proposalId}
          jobTitle={counterOfferResponseModal.jobTitle}
          counterOfferAmount={counterOfferResponseModal.counterOfferAmount}
          isOpen={counterOfferResponseModal.isOpen}
          onClose={() => setCounterOfferResponseModal(null)}
          onSuccess={() => {
            fetchJobs();
            setCounterOfferResponseModal(null);
          }}
        />
      )}
    </div>
  );
}


