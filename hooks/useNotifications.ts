'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket, disconnectSocket } from '@/lib/socket-client';
import { Socket } from 'socket.io-client';

interface Notification {
  id: string;
  type: string;
  message: string;
  data?: any;
  timestamp: Date;
}

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (!userId) return;

    const socketInstance = getSocket();
    setSocket(socketInstance);

    // Join user-specific room
    socketInstance.emit('join-user-room', userId);

    // Listen for new proposal notifications
    socketInstance.on('new-proposal', (data: any) => {
      const notification: Notification = {
        id: `notif-${Date.now()}`,
        type: 'new-proposal',
        message: `Nueva postulación para el trabajo: ${data.jobTitle}`,
        data,
        timestamp: new Date(),
      };
      
      setNotifications((prev) => [notification, ...prev]);
      
      // Trigger page refresh for jobs page
      if (typeof window !== 'undefined' && window.location.pathname === '/jobs') {
        window.dispatchEvent(new CustomEvent('job-proposal-received', { detail: data }));
      }
      
      // Show browser notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Nueva Postulación', {
          body: notification.message,
          icon: '/favicon.ico',
        });
      }
    });

    // Listen for proposal accepted notifications
    socketInstance.on('proposal-accepted', (data: any) => {
      const notification: Notification = {
        id: `notif-${Date.now()}`,
        type: 'proposal-accepted',
        message: `Tu postulación fue aceptada para: ${data.jobTitle}`,
        data,
        timestamp: new Date(),
      };
      
      setNotifications((prev) => [notification, ...prev]);
      
      // Trigger page refresh
      if (typeof window !== 'undefined' && window.location.pathname === '/jobs') {
        window.dispatchEvent(new CustomEvent('job-updated', { detail: data }));
      }
      
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Postulación Aceptada', {
          body: notification.message,
          icon: '/favicon.ico',
        });
      }
    });

    // Listen for counteroffer notifications
    socketInstance.on('proposal-counteroffered', (data: any) => {
      const notification: Notification = {
        id: `notif-${Date.now()}`,
        type: 'proposal-counteroffered',
        message: `Has recibido una contraoferta para: ${data.jobTitle}`,
        data,
        timestamp: new Date(),
      };
      
      setNotifications((prev) => [notification, ...prev]);
      
      // Trigger page refresh
      if (typeof window !== 'undefined' && window.location.pathname === '/jobs') {
        window.dispatchEvent(new CustomEvent('counteroffer-received', { detail: data }));
      }
      
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Contraoferta Recibida', {
          body: notification.message,
          icon: '/favicon.ico',
        });
      }
    });

    // Listen for counteroffer acceptance/rejection notifications
    socketInstance.on('counteroffer-accepted', (data: any) => {
      const notification: Notification = {
        id: `notif-${Date.now()}`,
        type: 'counteroffer-accepted',
        message: `El proveedor ha aceptado tu contraoferta para: ${data.jobTitle}`,
        data,
        timestamp: new Date(),
      };
      
      setNotifications((prev) => [notification, ...prev]);
      
      if (typeof window !== 'undefined' && window.location.pathname === '/jobs') {
        window.dispatchEvent(new CustomEvent('job-updated', { detail: data }));
      }
      
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Contraoferta Aceptada', {
          body: notification.message,
          icon: '/favicon.ico',
        });
      }
    });

    socketInstance.on('counteroffer-rejected', (data: any) => {
      const notification: Notification = {
        id: `notif-${Date.now()}`,
        type: 'counteroffer-rejected',
        message: `El proveedor ha rechazado tu contraoferta para: ${data.jobTitle}`,
        data,
        timestamp: new Date(),
      };
      
      setNotifications((prev) => [notification, ...prev]);
      
      if (typeof window !== 'undefined' && window.location.pathname === '/jobs') {
        window.dispatchEvent(new CustomEvent('counteroffer-rejected', { detail: data }));
      }
      
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Contraoferta Rechazada', {
          body: notification.message,
          icon: '/favicon.ico',
        });
      }
    });

    // Listen for job status change notifications
    socketInstance.on('job-status-changed', (data: any) => {
      const statusMessages: Record<string, Record<string, string>> = {
        'IN_PROGRESS': {
          'PENDING': 'El trabajo ha comenzado',
        },
        'COMPLETED': {
          'IN_PROGRESS': 'El trabajo ha sido completado',
        },
      };

      const statusMessage = data.message || 
        statusMessages[data.newStatus]?.[data.oldStatus] || 
        `El trabajo cambió de ${data.oldStatus} a ${data.newStatus}`;

      const notification: Notification = {
        id: `notif-${Date.now()}-${data.jobId}`,
        type: 'job-status-changed',
        message: `${statusMessage}: ${data.jobTitle}`,
        data,
        timestamp: new Date(),
      };
      
      setNotifications((prev) => [notification, ...prev]);
      
      // Trigger page refresh for jobs page
      if (typeof window !== 'undefined' && window.location.pathname === '/jobs') {
        window.dispatchEvent(new CustomEvent('job-status-changed', { detail: data }));
      }
      
      // Show browser notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        const title = data.newStatus === 'IN_PROGRESS' 
          ? 'Trabajo Iniciado' 
          : data.newStatus === 'COMPLETED'
          ? 'Trabajo Completado'
          : 'Estado del Trabajo Actualizado';
        
        new Notification(title, {
          body: notification.message,
          icon: '/favicon.ico',
        });
      }
    });

    return () => {
      socketInstance.off('new-proposal');
      socketInstance.off('proposal-accepted');
      socketInstance.off('proposal-counteroffered');
      socketInstance.off('counteroffer-accepted');
      socketInstance.off('counteroffer-rejected');
      socketInstance.off('job-status-changed');
    };
  }, [userId]);

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    socket,
    requestNotificationPermission,
    clearNotifications,
    removeNotification,
  };
}

