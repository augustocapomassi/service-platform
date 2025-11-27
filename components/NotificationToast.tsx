'use client';

import { useEffect, useState } from 'react';

interface Notification {
  id: string;
  type: string;
  message: string;
  data?: any;
  timestamp: Date;
}

interface NotificationToastProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

export default function NotificationToast({ notifications, onDismiss }: NotificationToastProps) {
  const [visibleNotifications, setVisibleNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    setVisibleNotifications(notifications.slice(0, 3)); // Show max 3 at a time
  }, [notifications]);

  if (visibleNotifications.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2">
      {visibleNotifications.map((notification) => (
        <div
          key={notification.id}
          className="bg-blue-600 text-white px-6 py-4 rounded-lg shadow-lg max-w-sm transition-all duration-300 ease-in-out transform translate-x-0"
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="font-semibold">{notification.message}</p>
              {notification.data?.jobTitle && (
                <p className="text-sm opacity-90 mt-1">{notification.data.jobTitle}</p>
              )}
            </div>
            <button
              onClick={() => onDismiss(notification.id)}
              className="ml-4 text-white hover:text-gray-200"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

