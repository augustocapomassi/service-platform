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
import { getSocket } from '@/lib/socket-client';
import Image from 'next/image';

interface Job {
  id: string;
  title: string;
  description: string;
  category: Specialty;
  status: JobStatus;
  amount: string;
  clientApproved?: boolean;
  providerApproved?: boolean;
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
        // Only pending jobs where I'm the client
        return job.client.id === user.id && job.status === JobStatus.PENDING;

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

  // Listen for real-time socket events and update jobs state immediately
  useEffect(() => {
    if (!user) return;

    let socket: ReturnType<typeof getSocket> | null = null;
    let isMounted = true;

    // Define event handlers outside setupSocket so cleanup can access them
    // Listen for new jobs created - add to list immediately
    const handleNewJobCreated = (data: any) => {
      console.log('🆕 New job created event received:', data);
      console.log('🆕 Current jobs count before adding:', allJobs.length);
      
      // Add the new job to the list immediately
      setAllJobs((prevJobs) => {
        // Check if job already exists (avoid duplicates)
        const exists = prevJobs.some(job => job.id === data.jobId);
        if (exists) {
          console.log(`⚠️ Job ${data.jobId} already exists in list, skipping add`);
          return prevJobs;
        }
        
        // Create a new job object from the event data
        const newJob: Job = {
          id: data.jobId,
          title: data.title,
          description: '', // Will be fetched later if needed
          category: data.category,
          status: JobStatus.PENDING,
          amount: data.amount,
          client: data.client,
          provider: null,
          reviews: [],
        };
        
        const updated = [newJob, ...prevJobs];
        console.log(`✅ Added job ${data.jobId} to list. Total: ${updated.length} jobs`);
        console.log('🆕 Jobs after adding:', updated.map(j => ({ id: j.id, title: j.title })));
        return updated;
      });
      
      // Optionally fetch to get complete job data (description, etc.) in the background
      setTimeout(() => fetchJobs(), 500);
    };

    // Listen for job deletion - remove from list immediately
    const handleJobDeleted = (data: any) => {
      console.log('🗑️ Job deleted event received:', data);
      console.log('🗑️ Current jobs count before deletion:', allJobs.length);
      
      setAllJobs((prevJobs) => {
        const filtered = prevJobs.filter((job) => job.id !== data.jobId);
        console.log(`✅ Removed job ${data.jobId} from list. Remaining: ${filtered.length} jobs`);
        console.log('🗑️ Jobs after deletion:', filtered.map(j => ({ id: j.id, title: j.title })));
        return filtered;
      });
    };

    // Listen for new proposals - fetch to get updated proposals list
    const handleNewProposal = (data: any) => {
      console.log('📨 New proposal received:', data);
      // Fetch to get the new proposal data
      fetchJobs();
    };

    // Listen for proposal accepted - update job status to IN_PROGRESS immediately
    const handleProposalAccepted = (data: any) => {
      console.log('✅ Proposal accepted:', data);
      setAllJobs((prevJobs) => {
        const updated = prevJobs.map((job) => {
          if (job.id === data.jobId) {
            console.log(`🔄 Updating job ${job.id} status to IN_PROGRESS`);
            return {
              ...job,
              status: JobStatus.IN_PROGRESS,
            };
          }
          return job;
        });
        return updated;
      });
      // Fetch to get complete updated job data (provider info, etc.)
      setTimeout(() => fetchJobs(), 500);
    };

    // Listen for job status changes - update immediately without fetch
    const handleJobStatusChanged = (data: any) => {
      console.log('🔄 Job status changed event received:', data);
      setAllJobs((prevJobs) => {
        const updatedJobs = prevJobs.map((job) => {
          if (job.id === data.jobId) {
            const newStatus = data.newStatus as JobStatus;
            console.log(`✅ Updating job ${job.id} status from ${job.status} to ${newStatus}`);
            return {
              ...job,
              status: newStatus,
            };
          }
          return job;
        });
        console.log('📋 Updated jobs state:', updatedJobs.length, 'jobs');
        return updatedJobs;
      });
    };

    // Listen for counteroffer events - fetch to get updated data
    const handleCounterofferReceived = (data: any) => {
      console.log('💰 Counteroffer received:', data);
      fetchJobs();
    };

    const handleCounterofferRejected = (data: any) => {
      console.log('❌ Counteroffer rejected:', data);
      fetchJobs();
    };

    const handleCounterofferAccepted = (data: any) => {
      console.log('✅ Counteroffer accepted:', data);
      setAllJobs((prevJobs) => {
        return prevJobs.map((job) => {
          if (job.id === data.jobId) {
            return {
              ...job,
              status: JobStatus.IN_PROGRESS,
            };
          }
          return job;
        });
      });
      setTimeout(() => fetchJobs(), 500);
    };

    const handleConnect = () => {
      console.log('✅ Socket connected in jobs page');
      if (isMounted && user && socket) {
        socket.emit('join-user-room', user.id);
      }
    };

    const handleDisconnect = (reason: string) => {
      console.log('❌ Socket disconnected in jobs page:', reason);
    };

    const setupSocket = async () => {
      try {
        socket = getSocket();
        
        console.log('🔌 Socket state:', {
          connected: socket.connected,
          disconnected: socket.disconnected,
          id: socket.id,
        });
        
        // Register listeners immediately, even if not connected yet
        // They will work once the socket connects
        console.log('📡 Registering socket listeners (socket may not be connected yet)...');
        
        // Join user room when socket connects (or now if already connected)
        const joinUserRoom = () => {
          if (isMounted && user && socket) {
            socket.emit('join-user-room', user.id);
            console.log('✅ Joined user room:', user.id);
          }
        };
        
        if (socket.connected) {
          joinUserRoom();
        } else {
          // Wait for connection, but don't fail if it takes time
          console.log('⏳ Socket not connected, will join room when connected...');
          socket.once('connect', () => {
            console.log('✅ Socket connected, joining user room');
            joinUserRoom();
          });
        }

        if (!isMounted) return;

        // Register socket listeners immediately (they will work when socket connects)
        console.log('📡 Registering socket listeners...');
        
        socket.on('new-job-created', (data) => {
          console.log('\n🎉 ========== NEW JOB CREATED EVENT RECEIVED ==========');
          console.log('🎉 Event data:', data);
          console.log('🎉 Job ID:', data.jobId);
          console.log('🎉 Job title:', data.title);
          console.log('🎉 Timestamp:', new Date().toISOString());
          if (socket) {
            console.log('🎉 Socket ID:', socket.id);
            console.log('🎉 Socket connected:', socket.connected);
          }
          console.log('🎉 ========== END EVENT ==========\n');
          handleNewJobCreated(data);
        });
        
        // Also listen via onAny to catch all events
        console.log('📡 Registered new-job-created listener, socket connected:', socket.connected);
        socket.on('job-deleted', (data) => {
          console.log('📥 Received job-deleted event:', data);
          handleJobDeleted(data);
        });
        socket.on('new-proposal', (data) => {
          console.log('📥 Received new-proposal event:', data);
          handleNewProposal(data);
        });
        socket.on('proposal-accepted', (data) => {
          console.log('📥 Received proposal-accepted event:', data);
          handleProposalAccepted(data);
        });
        socket.on('job-status-changed', (data) => {
          console.log('📥 Received job-status-changed event:', data);
          handleJobStatusChanged(data);
        });
        socket.on('proposal-counteroffered', (data) => {
          console.log('📥 Received proposal-counteroffered event:', data);
          handleCounterofferReceived(data);
        });
        socket.on('counteroffer-rejected', (data) => {
          console.log('📥 Received counteroffer-rejected event:', data);
          handleCounterofferRejected(data);
        });
        socket.on('counteroffer-accepted', (data) => {
          console.log('📥 Received counteroffer-accepted event:', data);
          handleCounterofferAccepted(data);
        });
        
        // Handle connect/disconnect
        socket.on('connect', () => {
          console.log('✅ Socket connected in jobs page');
          if (isMounted && user && socket) {
            socket.emit('join-user-room', user.id);
            console.log('✅ Joined user room after connect:', user.id);
          }
        });
        
        socket.on('disconnect', (reason) => {
          console.log('❌ Socket disconnected in jobs page:', reason);
        });
        
        // Listen for test event
        socket.on('test-event', (data) => {
          console.log('✅ Test event received from server:', data);
        });
        
        // Listen for test broadcast
        socket.on('test-broadcast', (data) => {
          console.log('✅ Test broadcast received from server:', data);
        });
        
        // Listen for test direct emit
        socket.on('test-direct-io-emit', (data) => {
          console.log('✅ Test direct io.emit received from server:', data);
        });
        
        // Listen for test direct emit from API
        socket.on('test-direct-emit', (data) => {
          console.log('✅ Test direct emit from API received:', data);
        });
        
        // Listen for test broadcast from API
        socket.on('test-broadcast-from-api', (data) => {
          console.log('✅ Test broadcast from API received:', data);
        });
        
        // Log all events for debugging
        socket.onAny((eventName, ...args) => {
          console.log(`\n🔔 ========== [JobsPage] EVENT RECEIVED ==========`);
          console.log(`🔔 [JobsPage] Event name: ${eventName}`);
          console.log(`🔔 [JobsPage] Timestamp: ${new Date().toISOString()}`);
          console.log(`🔔 [JobsPage] Event args:`, args);
          console.log(`🔔 [JobsPage] Event data:`, args[0]);
          if (socket) {
            console.log(`🔔 [JobsPage] Socket ID: ${socket.id}`);
            console.log(`🔔 [JobsPage] Socket connected: ${socket.connected}`);
            console.log(`🔔 [JobsPage] Event details:`, {
              eventName,
              argsCount: args.length,
              args: args,
              socketId: socket.id,
              connected: socket.connected,
            });
          }
          console.log(`🔔 ========== [JobsPage] END EVENT ==========\n`);
        });
        
        // Verify listeners are registered
        console.log('📋 All registered listeners:', {
          'new-job-created': socket.listeners('new-job-created').length,
          'job-deleted': socket.listeners('job-deleted').length,
          'job-status-changed': socket.listeners('job-status-changed').length,
          'new-proposal': socket.listeners('new-proposal').length,
          'proposal-accepted': socket.listeners('proposal-accepted').length,
          'proposal-counteroffered': socket.listeners('proposal-counteroffered').length,
          'counteroffer-rejected': socket.listeners('counteroffer-rejected').length,
          'counteroffer-accepted': socket.listeners('counteroffer-accepted').length,
          'test-event': socket.listeners('test-event').length,
          'connect': socket.listeners('connect').length,
          'disconnect': socket.listeners('disconnect').length,
        });

        // Test socket connection
        if (socket) {
          console.log('🧪 Socket setup complete:', {
            connected: socket.connected,
            id: socket.id,
            disconnected: socket.disconnected,
            transport: socket.io?.engine?.transport?.name,
          });
          
          // Verify listeners are registered
          console.log('📋 Registered listeners:', {
            'new-job-created': socket.listeners('new-job-created').length,
            'job-deleted': socket.listeners('job-deleted').length,
            'job-status-changed': socket.listeners('job-status-changed').length,
            'new-proposal': socket.listeners('new-proposal').length,
          });
        }
        
        // If already connected, join room now
        if (socket.connected) {
          joinUserRoom();
        } else {
          // Socket not connected - wait for automatic reconnection
          console.log('⚠️ Socket not connected, waiting for automatic reconnection...');
          console.log('⚠️ Socket state:', {
            connected: socket.connected,
            disconnected: socket.disconnected,
            id: socket.id,
            active: socket.active,
          });
          
          // Don't force connect - let Socket.IO handle reconnection automatically
          // Just wait for the connect event
          socket.once('connect', () => {
            console.log('✅ Socket reconnected, joining user room');
            joinUserRoom();
          });
        }

      } catch (error) {
        console.error('❌ Error setting up socket:', error);
      }
    };

    setupSocket();

    // Cleanup
    return () => {
      isMounted = false;
      if (socket) {
        console.log('🧹 Cleaning up socket listeners');
        socket.off('new-job-created', handleNewJobCreated);
        socket.off('job-deleted', handleJobDeleted);
        socket.off('new-proposal', handleNewProposal);
        socket.off('proposal-accepted', handleProposalAccepted);
        socket.off('job-status-changed', handleJobStatusChanged);
        socket.off('proposal-counteroffered', handleCounterofferReceived);
        socket.off('counteroffer-rejected', handleCounterofferRejected);
        socket.off('counteroffer-accepted', handleCounterofferAccepted);
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.offAny();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Only depend on user, not fetchJobs - fetchJobs is only used inside handlers

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
              Mis Trabajos Pendientes
              {user && (
                <span className="ml-2 py-0.5 px-2.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800">
                  {allJobs.filter((j) => j.client.id === user.id && j.status === JobStatus.PENDING).length}
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
                  {/* Show approval status for IN_PROGRESS jobs */}
                  {job.status === JobStatus.IN_PROGRESS && (
                    <div className="mt-2">
                      {job.clientApproved && job.providerApproved ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                          ✅ Aprobado por ambos
                        </span>
                      ) : job.clientApproved ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                          ⏳ Aprobado por cliente
                        </span>
                      ) : job.providerApproved ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                          ⏳ Aprobado por proveedor
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold">{job.title}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {job.category}
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                      {job.description}
                    </p>
                  </div>
                  {/* Botón de eliminar - solo para trabajos pendientes creados por el usuario */}
                  {user &&
                    job.status === JobStatus.PENDING &&
                    user.id === job.client.id && (
                      <button
                        onClick={async () => {
                          if (
                            !confirm(
                              '¿Estás seguro de que deseas eliminar este trabajo? Esta acción no se puede deshacer.'
                            )
                          ) {
                            return;
                          }
                          try {
                            const res = await fetch(`/api/jobs/${job.id}`, {
                              method: 'DELETE',
                            });
                            if (res.ok) {
                              // Don't call fetchJobs() - let the socket event handle it
                              // The socket event should remove the job from the list automatically
                              console.log('✅ Job deleted, waiting for socket event to update UI');
                              // Only fetch if socket event doesn't arrive after 2 seconds
                              setTimeout(() => {
                                console.log('⏰ Socket event timeout, fetching jobs manually');
                                fetchJobs();
                              }, 2000);
                            } else {
                              const error = await res.json();
                              alert(error.error || 'Error al eliminar el trabajo');
                            }
                          } catch (error) {
                            console.error('Error deleting job:', error);
                            alert('Error al eliminar el trabajo');
                          }
                        }}
                        className="ml-4 px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                        title="Eliminar trabajo"
                      >
                        🗑️ Eliminar
                      </button>
                    )}
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

              {/* Button to approve job if in progress */}
              {job.status === JobStatus.IN_PROGRESS && (
                <div className="border-t pt-4 mt-4">
                  {user && (
                    <>
                      {user.id === job.client.id && (
                        <>
                          {job.clientApproved ? (
                            <div className="text-center py-2">
                              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                                ✅ Ya aprobaste este trabajo
                              </p>
                              {!job.providerApproved && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Esperando aprobación del proveedor...
                                </p>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/jobs/${job.id}/complete`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                  });
                                  if (res.ok) {
                                    fetchJobs();
                                    alert('Trabajo aprobado! Esperando aprobación del proveedor.');
                                  } else {
                                    const error = await res.json();
                                    alert(error.error || 'Error al aprobar el trabajo');
                                  }
                                } catch (error) {
                                  console.error('Error approving job:', error);
                                  alert('Error al aprobar el trabajo');
                                }
                              }}
                              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                            >
                              ✅ Aprobar Trabajo (Cliente)
                            </button>
                          )}
                        </>
                      )}
                      {user.id === job.provider?.id && (
                        <>
                          {job.providerApproved ? (
                            <div className="text-center py-2">
                              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                                ✅ Ya aprobaste este trabajo
                              </p>
                              {!job.clientApproved && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Esperando aprobación del cliente...
                                </p>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/jobs/${job.id}/complete`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                  });
                                  if (res.ok) {
                                    fetchJobs();
                                    alert('Trabajo aprobado! Esperando aprobación del cliente.');
                                  } else {
                                    const error = await res.json();
                                    alert(error.error || 'Error al aprobar el trabajo');
                                  }
                                } catch (error) {
                                  console.error('Error approving job:', error);
                                  alert('Error al aprobar el trabajo');
                                }
                              }}
                              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                            >
                              ✅ Aprobar Trabajo (Proveedor)
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {job.status === JobStatus.COMPLETED && user && (
                <div className="border-t pt-4 mt-4">
                  {/* Verificar si el usuario ya calificó */}
                  {user.id === job.client.id && job.provider && (
                    <>
                      {!job.reviews.some(
                        (r: any) =>
                          r.reviewerId === user.id &&
                          r.role === ReviewRole.CLIENT_TO_PROVIDER
                      ) ? (
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            ¿Calificar al proveedor?
                          </p>
                          <button
                            onClick={() => handleReview(job, ReviewRole.CLIENT_TO_PROVIDER)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                          >
                            Calificar Proveedor
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          ✓ Ya calificaste al proveedor
                        </p>
                      )}
                    </>
                  )}
                  
                  {user.id === job.provider?.id && (
                    <>
                      {!job.reviews.some(
                        (r: any) =>
                          r.reviewerId === user.id &&
                          r.role === ReviewRole.PROVIDER_TO_CLIENT
                      ) ? (
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            ¿Calificar al cliente?
                          </p>
                          <button
                            onClick={() => handleReview(job, ReviewRole.PROVIDER_TO_CLIENT)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                          >
                            Calificar Cliente
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          ✓ Ya calificaste al cliente
                        </p>
                      )}
                    </>
                  )}
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
              {activeTab === 'my-jobs' && 'No tienes trabajos pendientes.'}
              {activeTab === 'in-progress' && 'No tienes trabajos en proceso.'}
              {activeTab === 'available' && 'No hay trabajos disponibles para postularse en este momento.'}
              {activeTab === 'completed' && 'No tienes trabajos finalizados aún.'}
            </p>
            {user && activeTab === 'my-jobs' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                + Crear Trabajo
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


